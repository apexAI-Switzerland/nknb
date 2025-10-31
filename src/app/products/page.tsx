'use client'

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"
import { supabase, ProduktMaster, ZutatenMaster, parseNutritionalValue } from "@/lib/supabase"
import { makeCsvBlobWithBom, parseCsvToObjects } from "@/lib/csv"
import { toast } from "@/components/ui/use-toast"
import { useState, useEffect, useCallback, useRef, Fragment } from "react"
import { X, ChevronDown } from "lucide-react"
import { decomposeProductIngredients } from "@/lib/calculations"

const productSchema = z.object({
  Produktname: z.string().min(1, "Name is required"),
  ingredients: z.array(z.object({
    IngredientID: z.string(),
    IngredientType: z.enum(['Zutat', 'Produkt']),
    Amount: z.number().min(0, "Amount must be positive"),
  })),
})

type ProductFormValues = z.infer<typeof productSchema>

// Define a type for ingredient relations
interface IngredientRelation {
  ID: number;
  IngredientType: 'ingredient' | 'product';
  IngredientID: number;
  Amount: number;
}

// Utility to convert array of objects to CSV
function arrayToCSV(data: any[], columns: string[], headers: string[]): string {
  const escape = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const header = headers.join(',');
  const rows = data.map(row => columns.map(col => escape(row[col])).join(','));
  return [header, ...rows].join('\r\n');
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProduktMaster[]>([])
  const [ingredients, setIngredients] = useState<ZutatenMaster[]>([])
  const [editingProductId, setEditingProductId] = useState<number | null>(null)
  const [nutritionalValues, setNutritionalValues] = useState({
    kJ: "0",
    kcal: "0",
    Fett: "0",
    "davon gesättigte Fettsäuren": "0",
    "davon einfach ungesättigte Fettsäuren": "0",
    "davon mehrfach ungesättigte Fettsäuren": "0",
    Kohlenhydrate: "0",
    "davon Zucker": "0",
    Eiweiss: "0",
    Ballaststoffe: "0",
    Salz: "0",
    "Vitamin A": "0",
    "B-Carotin (Provitamin A)": "0",
    "Vitamin D": "0",
    "Vitamin E": "0",
    "Vitamin C": "0",
    "Vitamin K": "0",
    "Vitamin B1 (Thiamin)": "0",
    "Vitamin B2 (Riboflavin)": "0",
    "Vitamin B3  Niacin (Vitamin PP)": "0",
    "Vitamin B6": "0",
    "Folsäure/Folacin": "0",
    "Vitamin B12": "0",
    "Biotin": "0",
    "Pantothensäure": "0",
    "Calcium": "0",
    "Phosphor": "0",
    "Eisen": "0",
    "Magnesium": "0",
    "Zink": "0",
    "Jod": "0",
    "Selen": "0",
    "Kupfer": "0",
    "Mangan": "0",
    "Chrom": "0",
    "Molybdän": "0",
    "Fluorid": "0",
    "Kalium": "0",
    "Chlorid": "0",
    "Cholin": "0",
    "Betain": "0",
    "Lycopin": "0",
    "mehrfachungesättigte Fettsäuren (n-6)": "0",
    "Alpha-Linolensäure (n-3) Omega3": "0",
    "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH": "0",
    "Linolsäure (Omega-6-Fettsäuren)": "0"
  })

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      Produktname: "",
      ingredients: [],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "ingredients",
  })

  // Add local search state for each ingredient dropdown
  const [ingredientSearch, setIngredientSearch] = useState<{ [key: number]: string }>({});
  const [dropdownOpen, setDropdownOpen] = useState<{ [key: number]: boolean }>({});
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-dropdown]')) {
        setDropdownOpen({});
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [productSearch, setProductSearch] = useState("");
  const [showCount, setShowCount] = useState(10);
  const [expanded, setExpanded] = useState<{ [key: number]: boolean }>({});
  const [productIngredients, setProductIngredients] = useState<{ [key: number]: IngredientRelation[] }>({});
  const [loadingIngredients, setLoadingIngredients] = useState<{ [key: number]: boolean }>({});
  const [ingredientNames, setIngredientNames] = useState<{ [key: string]: string }>({});

  // Add state for decomposed ingredients
  const [decomposedIngredients, setDecomposedIngredients] = useState<{ [key: number]: Array<{ name: string; amount: number }> }>({});

  // File input ref for product CSV upload
  const productUploadInputRef = useRef<HTMLInputElement | null>(null);

  // Add fetch functions
  const fetchIngredients = async () => {
    const { data } = await supabase()
      .from('ZutatenMaster')
      .select('*')
      .order('Name', { ascending: true });
    setIngredients(data || []);
  };

  const fetchProducts = async () => {
    const { data } = await supabase()
      .from('ProduktMaster')
      .select('*')
      .order('Produktname', { ascending: true });
    setProducts(data || []);
  };

  // Normalize type to DB representation for consistent keying
  const normalizeType = (t: 'Zutat' | 'Produkt' | 'ingredient' | 'product'): 'ingredient' | 'product' =>
    t === 'Zutat' ? 'ingredient' : t === 'Produkt' ? 'product' : t;
  const makeKey = (type: 'Zutat' | 'Produkt' | 'ingredient' | 'product', id: string | number) => `${normalizeType(type)}:${Number(id)}`;

  // Add useEffect to fetch data on component mount
  useEffect(() => {
    fetchIngredients();
    fetchProducts();
  }, []);

  // Wrap calculateNutrients in useCallback to fix the warning
  const calculateNutrients = useCallback((formIngredients: ProductFormValues['ingredients']) => {
    // Skip calculation if no ingredients
    if (formIngredients.length === 0) return;

    const values = {
      kJ: "0",
      kcal: "0",
      Fett: "0",
      "davon gesättigte Fettsäuren": "0",
      "davon einfach ungesättigte Fettsäuren": "0",
      "davon mehrfach ungesättigte Fettsäuren": "0",
      Kohlenhydrate: "0",
      "davon Zucker": "0",
      Eiweiss: "0",
      Ballaststoffe: "0",
      Salz: "0",
      "Vitamin A": "0",
      "B-Carotin (Provitamin A)": "0",
      "Vitamin D": "0",
      "Vitamin E": "0",
      "Vitamin C": "0",
      "Vitamin K": "0",
      "Vitamin B1 (Thiamin)": "0",
      "Vitamin B2 (Riboflavin)": "0",
      "Vitamin B3  Niacin (Vitamin PP)": "0",
      "Vitamin B6": "0",
      "Folsäure/Folacin": "0",
      "Vitamin B12": "0",
      "Biotin": "0",
      "Pantothensäure": "0",
      "Calcium": "0",
      "Phosphor": "0",
      "Eisen": "0",
      "Magnesium": "0",
      "Zink": "0",
      "Jod": "0",
      "Selen": "0",
      "Kupfer": "0",
      "Mangan": "0",
      "Chrom": "0",
      "Molybdän": "0",
      "Fluorid": "0",
      "Kalium": "0",
      "Chlorid": "0",
      "Cholin": "0",
      "Betain": "0",
      "Lycopin": "0",
      "mehrfachungesättigte Fettsäuren (n-6)": "0",
      "Alpha-Linolensäure (n-3) Omega3": "0",
      "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH": "0",
      "Linolsäure (Omega-6-Fettsäuren)": "0"
    }

    // Get all nutritional keys from the values object
    const nutritionalKeys = Object.keys(values) as (keyof typeof values)[];

    formIngredients.forEach(item => {
      // Skip ingredients with no ID or amount
      if (!item.IngredientID || item.Amount <= 0) return;
      
      const source = item.IngredientType === 'Zutat' ? ingredients : products
      const ingredient = source.find(i => i.ID.toString() === item.IngredientID)

      if (ingredient) {
        const multiplier = item.Amount / 100 // Convert to percentage
        nutritionalKeys.forEach(key => {
          // Skip keys that don't exist in the ingredient
          if (!(key in ingredient)) return;
          
          // Handle special case for keys with spaces
          const actualKey = key as keyof typeof ingredient;
          const currentValue = parseNutritionalValue(values[key]);
          const ingredientValue = parseNutritionalValue(ingredient[actualKey] as string);
          
          values[key] = (currentValue + ingredientValue * multiplier).toFixed(1);
        })
      }
    })

    console.log("Updated nutritional values:", values);
    setNutritionalValues(values)
  }, [ingredients, products]);

  useEffect(() => {
    const watchedIngredients = form.watch("ingredients");
    if (watchedIngredients.length > 0) {
      calculateNutrients(watchedIngredients);
    }
  }, [form, calculateNutrients]);

  // Create a handler for ingredient selection changes
  const handleIngredientChange = (index: number, value: string) => {
    const currentIngredient = form.getValues(`ingredients.${index}`);
    const field = form.getValues(`ingredients.${index}.IngredientType`);
    const source = field === 'Zutat' ? ingredients : products;
    const ingredient = source.find(i => i.ID.toString() === value);
    
    if (ingredient && currentIngredient.Amount > 0) {
      // Trigger calculation when selection changes and amount is set
      calculateNutrients(form.getValues('ingredients'));
    }
  };

  // Create a handler for amount changes
  const handleAmountChange = (index: number) => {
    const currentIngredient = form.getValues(`ingredients.${index}`);
    
    if (currentIngredient.IngredientID) {
      // Trigger calculation when amount changes and ingredient is selected
      calculateNutrients(form.getValues('ingredients'));
    }
  };

  // Create a handler for ingredient type changes
  const handleTypeChange = (index: number) => {
    // Reset the ingredient ID when type changes
    form.setValue(`ingredients.${index}.IngredientID`, "");
    calculateNutrients(form.getValues('ingredients'));
  };

  async function onSubmit(data: ProductFormValues) {
    try {
      console.log("Form data:", data);
      
      // Ensure all nutritional values are valid strings
      const sanitizedValues = Object.fromEntries(
        Object.entries(nutritionalValues).map(([key, value]) => [
          key, 
          (typeof value === 'string' ? value : String(value || '0'))
        ])
      );
      
      // If editing, update existing product; otherwise create new
      let productId: number | null = editingProductId;
      if (editingProductId) {
        const { error: updateError } = await supabase()
          .from('ProduktMaster')
          .update({
            Produktname: data.Produktname,
            ...sanitizedValues
          })
          .eq('ID', editingProductId);
        if (updateError) {
          console.error('Error updating product:', updateError);
          throw updateError;
        }
      } else {
        const { data: newProduct, error: insertError } = await supabase()
          .from('ProduktMaster')
          .insert({
            Produktname: data.Produktname,
            ...sanitizedValues
          })
          .select()
          .single();
        if (insertError) {
          console.error('Error creating product:', insertError);
          throw insertError;
        }
        productId = newProduct?.ID ?? null;
      }

      // Then, synchronize ingredient relationships: delete removed, update changed, insert new
      if (productId || editingProductId) {
        const effectiveId = productId || editingProductId!;
        // Build desired state from form
        const validIngredients = (data.ingredients || []).filter(ing => ing.IngredientID !== "");
        const dedupedMap = new Map<string, { IngredientID: string; IngredientType: 'Zutat' | 'Produkt'; Amount: number }>();
        for (const ing of validIngredients) {
          const key = makeKey(ing.IngredientType, ing.IngredientID);
          dedupedMap.set(key, ing);
        }
        const desired = Array.from(dedupedMap.values());

        try {
          // Fetch current state
          const { data: existing, error: fetchRelErr } = await supabase()
            .from('ProductIngredients')
            .select('*')
            .eq('ProductID', effectiveId);
          if (fetchRelErr) throw fetchRelErr;
          const existingArr = existing || [];
          // Group existing rows by normalized key so we can detect duplicates
          const existingGroups = new Map<string, any[]>();
          for (const r of existingArr) {
            const key = makeKey(r.IngredientType as any, r.IngredientID);
            const group = existingGroups.get(key) || [];
            group.push(r);
            existingGroups.set(key, group);
          }

          // Compute diffs
          const toDeleteIds: number[] = [];
          const toInsert = [] as Array<{ ProductID: number; IngredientID: number; IngredientType: 'ingredient' | 'product'; Amount: number }>;
          const toUpdateById = [] as Array<{ ID: number; Amount: number }>;

          // Mark deletions for groups that are no longer desired
          for (const [key, group] of existingGroups.entries()) {
            if (!dedupedMap.has(key)) {
              toDeleteIds.push(...group.map(g => g.ID));
            }
          }

          for (const d of desired) {
            const key = makeKey(d.IngredientType, d.IngredientID);
            const group = existingGroups.get(key) || [];
            const normalizedAmount = parseFloat(d.Amount.toString()) || 0;
            if (group.length === 0) {
              // New relation
              toInsert.push({
                ProductID: effectiveId,
                IngredientID: Number(d.IngredientID),
                IngredientType: normalizeType(d.IngredientType),
                Amount: normalizedAmount,
              });
            } else {
              // Keep the first, delete the rest, and update the kept one's amount if changed
              const [keep, ...dupes] = group;
              if (dupes.length > 0) toDeleteIds.push(...dupes.map(d => d.ID));
              const existingAmt = Number(keep.Amount) || 0;
              if (Math.abs(existingAmt - normalizedAmount) > 1e-6) {
                toUpdateById.push({ ID: keep.ID, Amount: normalizedAmount });
              }
            }
          }

          // Execute deletes
          if (toDeleteIds.length > 0) {
            const { error: delErr } = await supabase().from('ProductIngredients').delete().in('ID', toDeleteIds);
            if (delErr) {
              console.error('Delete error (toDeleteIds):', delErr, toDeleteIds);
              throw delErr;
            }
          }

          // Execute updates (by specific IDs)
          if (toUpdateById.length > 0) {
            const results = await Promise.all(toUpdateById.map(u =>
              supabase().from('ProductIngredients').update({ Amount: u.Amount }).eq('ID', u.ID)
            ));
            const updateErr = results.find(r => (r as any)?.error)?.error;
            if (updateErr) {
              console.error('Update error (toUpdateById):', updateErr, toUpdateById);
              throw updateErr;
            }
          }

          // Execute inserts
          if (toInsert.length > 0) {
            const { error: insErr } = await supabase().from('ProductIngredients').insert(toInsert);
            if (insErr) throw insErr;
          }

          // Final cleanup: ensure no duplicates remain (defensive)
          const { data: afterSave, error: afterSaveErr } = await supabase()
            .from('ProductIngredients')
            .select('*')
            .eq('ProductID', effectiveId);
          if (afterSaveErr) {
            console.error('Post-save fetch error:', afterSaveErr);
            throw afterSaveErr;
          }
          const groups: Record<string, any[]> = {};
          (afterSave || []).forEach(r => {
            const k = makeKey(r.IngredientType as any, r.IngredientID);
            groups[k] ||= [];
            groups[k].push(r);
          });
          const dupesToDelete: number[] = [];
          Object.values(groups).forEach(arr => {
            if (arr.length > 1) {
              // keep the row with the latest CreatedAt or highest ID
              const sorted = [...arr].sort((a, b) => (new Date(b.CreatedAt || 0).getTime() - new Date(a.CreatedAt || 0).getTime()) || (b.ID - a.ID));
              const [, ...rest] = sorted;
              dupesToDelete.push(...rest.map(r => r.ID));
            }
          });
          if (dupesToDelete.length) {
            const { error: dupDelErr } = await supabase().from('ProductIngredients').delete().in('ID', dupesToDelete);
            if (dupDelErr) {
              console.error('Delete error (dupesToDelete):', dupDelErr, dupesToDelete);
              throw dupDelErr;
            }
          }

          // Final prune: any rows whose key is not in desired should be removed (defensive once more)
          const desiredKeySet = new Set(Array.from(dedupedMap.keys()));
          const strayIds: number[] = [];
          (afterSave || []).forEach(r => {
            const key = makeKey(r.IngredientType as any, r.IngredientID);
            if (!desiredKeySet.has(key)) strayIds.push(r.ID);
          });
          if (strayIds.length) {
            const { error: strayDelErr } = await supabase().from('ProductIngredients').delete().in('ID', strayIds);
            if (strayDelErr) {
              console.error('Delete error (strayIds):', strayDelErr, strayIds);
              throw strayDelErr;
            }
          }
        } catch (err) {
          console.error('Error synchronizing ingredients:', err);
          toast({ title: 'Fehler', description: 'Zutaten konnten nicht gespeichert werden', variant: 'destructive' });
          throw err;
        }
      }

      const effectiveRefreshId = (productId || editingProductId) ?? null;

      toast({
        title: 'Success',
        description: editingProductId ? 'Produkt erfolgreich aktualisiert' : 'Produkt erfolgreich erstellt',
      })

      // Fetch products immediately to update the UI
      await fetchProducts()
      // Always clear cached ingredients for this product so next expand shows fresh data
      if (effectiveRefreshId) {
        setProductIngredients(prev => {
          const { [effectiveRefreshId]: _removed, ...rest } = prev as any;
          return rest as any;
        });
        // If details are open, force-refetch immediately
        if (expanded[effectiveRefreshId]) {
          await fetchProductIngredients(effectiveRefreshId, true)
        }
      }
      
      // Reset the form and editing state
      form.reset()
      setEditingProductId(null)
      setNutritionalValues({
        kJ: "0",
        kcal: "0",
        Fett: "0",
        "davon gesättigte Fettsäuren": "0",
        "davon einfach ungesättigte Fettsäuren": "0",
        "davon mehrfach ungesättigte Fettsäuren": "0",
        Kohlenhydrate: "0",
        "davon Zucker": "0",
        Eiweiss: "0",
        Ballaststoffe: "0",
        Salz: "0",
        "Vitamin A": "0",
        "B-Carotin (Provitamin A)": "0",
        "Vitamin D": "0",
        "Vitamin E": "0",
        "Vitamin C": "0",
        "Vitamin K": "0",
        "Vitamin B1 (Thiamin)": "0",
        "Vitamin B2 (Riboflavin)": "0",
        "Vitamin B3  Niacin (Vitamin PP)": "0",
        "Vitamin B6": "0",
        "Folsäure/Folacin": "0",
        "Vitamin B12": "0",
        "Biotin": "0",
        "Pantothensäure": "0",
        "Calcium": "0",
        "Phosphor": "0",
        "Eisen": "0",
        "Magnesium": "0",
        "Zink": "0",
        "Jod": "0",
        "Selen": "0",
        "Kupfer": "0",
        "Mangan": "0",
        "Chrom": "0",
        "Molybdän": "0",
        "Fluorid": "0",
        "Kalium": "0",
        "Chlorid": "0",
        "Cholin": "0",
        "Betain": "0",
        "Lycopin": "0",
        "mehrfachungesättigte Fettsäuren (n-6)": "0",
        "Alpha-Linolensäure (n-3) Omega3": "0",
        "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH": "0",
        "Linolsäure (Omega-6-Fettsäuren)": "0"
      })
    } catch (error: unknown) {
      console.error('Error adding product:', error);
      let message = "Failed to add product";
      if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
        message = (error as { message: string }).message;
      }
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      })
    }
  }

  // Filter products by search
  const filteredProducts = products.filter(product =>
    !productSearch || (product.Produktname && product.Produktname.toLowerCase().includes(productSearch.toLowerCase()))
  );
  const visibleProducts = filteredProducts.slice(0, showCount);

  // Fetch ingredients for a product when expanded
  async function fetchProductIngredients(productId: number, force: boolean = false) {
    if (!force && productIngredients[productId]) return; // Already fetched
    setLoadingIngredients(l => ({ ...l, [productId]: true }));
    const { data: ingredientData, error: ingredientError } = await supabase()
      .from('ProductIngredients')
      .select('*')
      .eq('ProductID', productId);
    if (!ingredientError) {
      setProductIngredients(pi => ({ ...pi, [productId]: ingredientData }));
    }
    setLoadingIngredients(l => ({ ...l, [productId]: false }));
  }

  // Fetch ingredient/product names for a list of ProductIngredients
  async function fetchIngredientNames(ingredients: IngredientRelation[]): Promise<void> {
    const missing = ingredients.filter((ing) => !ingredientNames[`${ing.IngredientType}:${ing.IngredientID}`]);
    if (missing.length === 0) return;
    const ingredientIds = missing.filter((ing) => ing.IngredientType === 'ingredient').map((ing) => ing.IngredientID);
    const productIds = missing.filter((ing) => ing.IngredientType === 'product').map((ing) => ing.IngredientID);
    const newNames: { [key: string]: string } = {};
    if (ingredientIds.length > 0) {
      const { data: zutatData } = await supabase().from('ZutatenMaster').select('ID, Name').in('ID', ingredientIds);
      if (zutatData) {
        zutatData.forEach((ing: ZutatenMaster) => { newNames[`ingredient:${ing.ID}`] = ing.Name || ''; });
      }
    }
    if (productIds.length > 0) {
      const { data: produktData } = await supabase().from('ProduktMaster').select('ID, Produktname').in('ID', productIds);
      if (produktData) {
        produktData.forEach((prod: ProduktMaster) => { newNames[`product:${prod.ID}`] = prod.Produktname || ''; });
      }
    }
    setIngredientNames(names => ({ ...names, ...newNames }));
  }

  // Helper to get and cache decomposed ingredients for a product
  const getDecomposedIngredients = async (productId: number, amount: number) => {
    if (decomposedIngredients[productId]) return decomposedIngredients[productId];
    const result = await decomposeProductIngredients(productId, amount);
    setDecomposedIngredients(prev => ({ ...prev, [productId]: result }));
    return result;
  };

  // Export handler
  const handleExportCSV = async () => {
    try {
      const { data, error } = await supabase()
        .from('ProduktMaster')
        .select('*');
      if (error) throw error;
      if (!data || data.length === 0) return;
      // Export all columns
      const columns = Object.keys(data[0]);
      const headers = columns;
      const csv = arrayToCSV(data, columns, headers);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'produkte.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ title: 'Fehler', description: 'Export fehlgeschlagen', variant: 'destructive' });
    }
  };

  // Product template download (only Produktname)
  const downloadProductTemplate = () => {
    const header = 'Produktname';
    const blob = makeCsvBlobWithBom([header]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'produkte_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Upload products CSV (names only)
  const handleUploadProductsCSV = async (file: File) => {
    try {
      const text = await file.text();
      const { rows, errors } = parseCsvToObjects(text);
      if (errors.length) throw new Error(errors[0]);
      if (!rows.length) throw new Error('Keine gültigen Zeilen gefunden.');

      // Extract Produktname, trim, dedupe
      const names = rows
        .map(r => (r['Produktname'] ?? '').toString().trim())
        .filter(n => n.length > 0);
      const uniqueNames = Array.from(new Set(names.map(n => n.toLowerCase())));
      if (!uniqueNames.length) throw new Error('Keine Produktnamen gefunden.');

      // Fetch existing product names
      const { data: existing, error: fetchErr } = await supabase().from('ProduktMaster').select('ID, Produktname');
      if (fetchErr) throw fetchErr;
      const existingLower = new Set((existing || []).map(e => (e.Produktname || '').toLowerCase()));

      const toInsert = uniqueNames
        .filter(n => !existingLower.has(n))
        .map(n => ({ Produktname: rows.find(r => (r['Produktname'] || '').toString().trim().toLowerCase() === n)!['Produktname'].toString().trim() }));

      let created = 0; let skipped = uniqueNames.length - toInsert.length;
      if (toInsert.length) {
        const { error: insertErr, count } = await supabase().from('ProduktMaster').insert(toInsert, { count: 'exact' });
        if (insertErr) throw insertErr;
        created = count ?? toInsert.length;
      }
      toast({ title: 'Import abgeschlossen', description: `${created} erstellt, ${skipped} übersprungen.` });
      fetchProducts();
    } catch (e: any) {
      toast({ title: 'Fehler beim Import', description: e?.message || 'Unbekannter Fehler', variant: 'destructive' });
    }
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{editingProductId ? 'Produkt bearbeiten' : 'Produkt erfassen'}</h1>
      
      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="Produktname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Produktname</FormLabel>
                    <FormControl>
                      <Input placeholder="Produktname eingeben" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <h3 className="text-lg font-medium mb-2">Zutaten</h3>
                
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-3 mb-4 items-center p-4 border rounded-lg bg-gray-50/50">
                    {/* Type Selector */}
                    <div className="w-24 flex-shrink-0">
                      <FormField
                        control={form.control}
                        name={`ingredients.${index}.IngredientType`}
                        render={({ field }) => (
                          <FormItem>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                handleTypeChange(index);
                              }}
                            >
                              <SelectTrigger className="h-10">
                                <SelectValue placeholder="Typ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Zutat">Zutat</SelectItem>
                                <SelectItem value="Produkt">Produkt</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Custom Search & Select */}
                    <div className="flex-1 min-w-0 relative">
                      <FormField
                        control={form.control}
                        name={`ingredients.${index}.IngredientID`}
                        render={({ field }) => {
                          const currentType = form.watch(`ingredients.${index}.IngredientType`);
                          const currentSource = currentType === 'Zutat' ? ingredients : products;
                          const filteredItems = currentSource.filter(item => {
                            if (!ingredientSearch[index]) return true;
                            const name = currentType === 'Zutat' ? item.Name : item.Produktname;
                            return typeof name === 'string' && name.toLowerCase().includes(ingredientSearch[index].toLowerCase());
                          });
                          
                          const selectedItem = currentSource.find(item => item.ID.toString() === field.value);
                          const displayValue = selectedItem ? 
                            (currentType === 'Zutat' ? selectedItem.Name : selectedItem.Produktname) : 
                            '';

                          return (
                            <FormItem>
                              <div className="relative" data-dropdown>
                                {/* Trigger Button */}
                                <button
                                  type="button"
                                  onClick={() => setDropdownOpen(prev => ({ ...prev, [index]: !prev[index] }))}
                                  className="w-full h-10 px-3 py-2 text-left border border-input bg-background rounded-md hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center justify-between"
                                >
                                  <span className={displayValue ? "text-foreground" : "text-muted-foreground"}>
                                    {displayValue || `${currentType} auswählen...`}
                                  </span>
                                  <ChevronDown className="h-4 w-4 opacity-50" />
                                </button>

                                {/* Dropdown Content */}
                                {dropdownOpen[index] && (
                                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-md shadow-md max-h-60 overflow-hidden">
                                    {/* Search Input */}
                                    <div className="p-2 border-b bg-background sticky top-0 z-10">
                                      <Input
                                        placeholder={`${currentType} suchen...`}
                                        value={ingredientSearch[index] || ""}
                                        onChange={e => setIngredientSearch(s => ({ ...s, [index]: e.target.value }))}
                                        className="h-8"
                                        autoComplete="off"
                                        spellCheck={false}
                                        autoFocus
                                      />
                                    </div>
                                    
                                    {/* Options List */}
                                    <div className="max-h-48 overflow-y-auto">
                                      {filteredItems.map(item => (
                                        <button
                                          key={item.ID}
                                          type="button"
                                          onClick={() => {
                                            field.onChange(item.ID.toString());
                                            handleIngredientChange(index, item.ID.toString());
                                            setDropdownOpen(prev => ({ ...prev, [index]: false }));
                                          }}
                                          className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none flex items-center justify-between"
                                        >
                                          <span>{currentType === 'Zutat' ? item.Name : item.Produktname}</span>
                                          <span className="text-xs text-muted-foreground ml-2">
                                            {currentType}
                                          </span>
                                        </button>
                                      ))}
                                      
                                      {/* No results */}
                                      {filteredItems.length === 0 && ingredientSearch[index] && (
                                        <div className="p-2 text-sm text-muted-foreground text-center">
                                          Keine Ergebnisse gefunden
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </FormItem>
                          );
                        }}
                      />
                    </div>

                    {/* Amount input */}
                    <div className="w-32 flex-shrink-0">
                      <FormField
                        control={form.control}
                        name={`ingredients.${index}.Amount`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  placeholder="0"
                                  className="h-10"
                                  {...field}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    field.onChange(value);
                                    handleAmountChange(index);
                                  }}
                                />
                                <span className="text-sm text-gray-600 font-medium">g</span>
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Remove button */}
                    <div className="flex-shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => remove(index)}
                        className="h-10 w-10 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => append({ IngredientID: "", IngredientType: "Zutat", Amount: 0 })}
                  className="mt-4 w-full border-dashed border-2 border-gray-300 hover:border-gray-400 hover:bg-gray-50 text-gray-600 hover:text-gray-700"
                >
                  + Zutat hinzufügen
                </Button>
              </div>

              <div className="bg-muted p-4 rounded-md">
                <h3 className="text-lg font-medium mb-2">Nährwerte (pro 100g)</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Basic nutritional information */}
                  <div>
                    <h4 className="font-medium mb-1">Grundlegende Informationen</h4>
                    {parseNutritionalValue(nutritionalValues.kJ) > 0 && (
                      <p>Energie: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.kJ).toFixed(1)} kJ / {parseNutritionalValue(nutritionalValues.kcal).toFixed(1)} kcal</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues.Fett) > 0 && (
                      <p>Fett: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Fett).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["davon gesättigte Fettsäuren"]) > 0 && (
                      <p>- gesättigt: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon gesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["davon einfach ungesättigte Fettsäuren"]) > 0 && (
                      <p>- einfach ungesättigt: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon einfach ungesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["davon mehrfach ungesättigte Fettsäuren"]) > 0 && (
                      <p>- mehrfach ungesättigt: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon mehrfach ungesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues.Kohlenhydrate) > 0 && (
                      <p>Kohlenhydrate: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Kohlenhydrate).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["davon Zucker"]) > 0 && (
                      <p>- davon Zucker: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon Zucker"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues.Ballaststoffe) > 0 && (
                      <p>Ballaststoffe: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Ballaststoffe).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues.Eiweiss) > 0 && (
                      <p>Eiweiß: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Eiweiss).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues.Salz) > 0 && (
                      <p>Salz: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Salz).toFixed(1)} g</span></p>
                    )}
                  </div>
                  
                  {/* Essential fatty acids */}
                  <div>
                    <h4 className="font-medium mb-1">Essentielle Fettsäuren</h4>
                    {parseNutritionalValue(nutritionalValues["mehrfachungesättigte Fettsäuren (n-6)"]) > 0 && (
                      <p>Omega-6-Fettsäuren: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["mehrfachungesättigte Fettsäuren (n-6)"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["Linolsäure (Omega-6-Fettsäuren)"]) > 0 && (
                      <p>Linolsäure (Omega-6): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Linolsäure (Omega-6-Fettsäuren)"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["Alpha-Linolensäure (n-3) Omega3"]) > 0 && (
                      <p>Alpha-Linolensäure (Omega-3): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Alpha-Linolensäure (n-3) Omega3"]).toFixed(1)} g</span></p>
                    )}
                    {parseNutritionalValue(nutritionalValues["Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"]) > 0 && (
                      <p>EPA + DHA: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"]).toFixed(1)} g</span></p>
                    )}
                  </div>
                </div>
                
                <div className="mt-4">
                  <details>
                    <summary className="font-medium cursor-pointer">Vitamine</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-gray-100 rounded">
                      <div>
                        {parseNutritionalValue(nutritionalValues["Vitamin A"]) > 0 && (
                          <p>Vitamin A: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin A"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["B-Carotin (Provitamin A)"]) > 0 && (
                          <p>B-Carotin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["B-Carotin (Provitamin A)"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin D"]) > 0 && (
                          <p>Vitamin D: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin D"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin E"]) > 0 && (
                          <p>Vitamin E: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin E"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin C"]) > 0 && (
                          <p>Vitamin C: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin C"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin K"]) > 0 && (
                          <p>Vitamin K: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin K"]).toFixed(1)}</span></p>
                        )}
                      </div>
                      <div>
                        {parseNutritionalValue(nutritionalValues["Vitamin B1 (Thiamin)"]) > 0 && (
                          <p>Vitamin B1 (Thiamin): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B1 (Thiamin)"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin B2 (Riboflavin)"]) > 0 && (
                          <p>Vitamin B2 (Riboflavin): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B2 (Riboflavin)"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin B3  Niacin (Vitamin PP)"]) > 0 && (
                          <p>Vitamin B3 (Niacin): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B3  Niacin (Vitamin PP)"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin B6"]) > 0 && (
                          <p>Vitamin B6: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B6"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Folsäure/Folacin"]) > 0 && (
                          <p>Folsäure: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Folsäure/Folacin"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Vitamin B12"]) > 0 && (
                          <p>Vitamin B12: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B12"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Biotin"]) > 0 && (
                          <p>Biotin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Biotin"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Pantothensäure"]) > 0 && (
                          <p>Pantothensäure: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Pantothensäure"]).toFixed(1)}</span></p>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
                
                <div className="mt-2">
                  <details>
                    <summary className="font-medium cursor-pointer">Mineralstoffe</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-gray-100 rounded">
                      <div>
                        {parseNutritionalValue(nutritionalValues["Calcium"]) > 0 && (
                          <p>Calcium: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Calcium"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Phosphor"]) > 0 && (
                          <p>Phosphor: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Phosphor"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Eisen"]) > 0 && (
                          <p>Eisen: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Eisen"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Magnesium"]) > 0 && (
                          <p>Magnesium: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Magnesium"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Zink"]) > 0 && (
                          <p>Zink: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Zink"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Jod"]) > 0 && (
                          <p>Jod: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Jod"]).toFixed(1)}</span></p>
                        )}
                      </div>
                      <div>
                        {parseNutritionalValue(nutritionalValues["Selen"]) > 0 && (
                          <p>Selen: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Selen"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Kupfer"]) > 0 && (
                          <p>Kupfer: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Kupfer"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Mangan"]) > 0 && (
                          <p>Mangan: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Mangan"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Chrom"]) > 0 && (
                          <p>Chrom: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Chrom"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Molybdän"]) > 0 && (
                          <p>Molybdän: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Molybdän"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Kalium"]) > 0 && (
                          <p>Kalium: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Kalium"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Chlorid"]) > 0 && (
                          <p>Chlorid: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Chlorid"]).toFixed(1)}</span></p>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
                
                <div className="mt-2">
                  <details>
                    <summary className="font-medium cursor-pointer">Sonstige Nährstoffe</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-gray-100 rounded">
                      <div>
                        {parseNutritionalValue(nutritionalValues["Cholin"]) > 0 && (
                          <p>Cholin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Cholin"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Betain"]) > 0 && (
                          <p>Betain: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Betain"]).toFixed(1)}</span></p>
                        )}
                      </div>
                      <div>
                        {parseNutritionalValue(nutritionalValues["Lycopin"]) > 0 && (
                          <p>Lycopin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Lycopin"]).toFixed(1)}</span></p>
                        )}
                        {parseNutritionalValue(nutritionalValues["Fluorid"]) > 0 && (
                          <p>Fluorid: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Fluorid"]).toFixed(1)}</span></p>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1">
                  {editingProductId ? 'Produkt aktualisieren' : 'Produkt speichern'}
                </Button>
                {editingProductId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingProductId(null);
                      form.reset({ Produktname: '', ingredients: [] });
                      setNutritionalValues({
                        kJ: "0",
                        kcal: "0",
                        Fett: "0",
                        "davon gesättigte Fettsäuren": "0",
                        "davon einfach ungesättigte Fettsäuren": "0",
                        "davon mehrfach ungesättigte Fettsäuren": "0",
                        Kohlenhydrate: "0",
                        "davon Zucker": "0",
                        Eiweiss: "0",
                        Ballaststoffe: "0",
                        Salz: "0",
                        "Vitamin A": "0",
                        "B-Carotin (Provitamin A)": "0",
                        "Vitamin D": "0",
                        "Vitamin E": "0",
                        "Vitamin C": "0",
                        "Vitamin K": "0",
                        "Vitamin B1 (Thiamin)": "0",
                        "Vitamin B2 (Riboflavin)": "0",
                        "Vitamin B3  Niacin (Vitamin PP)": "0",
                        "Vitamin B6": "0",
                        "Folsäure/Folacin": "0",
                        "Vitamin B12": "0",
                        Biotin: "0",
                        Pantothensäure: "0",
                        Calcium: "0",
                        Phosphor: "0",
                        Eisen: "0",
                        Magnesium: "0",
                        Zink: "0",
                        Jod: "0",
                        Selen: "0",
                        Kupfer: "0",
                        Mangan: "0",
                        Chrom: "0",
                        Molybdän: "0",
                        Fluorid: "0",
                        Kalium: "0",
                        Chlorid: "0",
                        Cholin: "0",
                        Betain: "0",
                        Lycopin: "0",
                        "mehrfachungesättigte Fettsäuren (n-6)": "0",
                        "Alpha-Linolensäure (n-3) Omega3": "0",
                        "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH": "0",
                        "Linolsäure (Omega-6-Fettsäuren)": "0"
                      });
                    }}
                  >
                    Abbrechen
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <h2 className="text-xl font-bold mt-12 mb-6 naturkostbar-accent">Produktliste</h2>
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          type="text"
          placeholder="Produkte suchen..."
          className="border rounded px-3 py-2 w-full sm:w-64"
          value={productSearch}
          onChange={e => {
            setProductSearch(e.target.value);
            setShowCount(10); // Reset pagination on search
          }}
        />
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={downloadProductTemplate}>Template herunterladen</Button>
          <Button variant="outline" onClick={handleExportCSV}>Export als CSV</Button>
          <input
            ref={productUploadInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadProductsCSV(file);
              // reset to allow same-file reselect
              if (productUploadInputRef.current) productUploadInputRef.current.value = '';
            }}
          />
          <Button type="button" onClick={() => productUploadInputRef.current?.click()}>CSV hochladen</Button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border rounded bg-white">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-2 text-left font-semibold">Name</th>
              <th className="px-4 py-2 text-left font-semibold">kcal</th>
              <th className="px-4 py-2 text-left font-semibold">Fett (g)</th>
              <th className="px-4 py-2 text-left font-semibold">Kohlenhydrate (g)</th>
              <th className="px-4 py-2 text-left font-semibold">Eiweiß (g)</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map(product => (
              <Fragment key={product.ID}>
                <tr className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{product.Produktname}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.kcal).toFixed(1)}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.Fett).toFixed(1)}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.Kohlenhydrate).toFixed(1)}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.Eiweiss).toFixed(1)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3">
                      <button
                        className="text-sm text-blue-600 hover:underline"
                        onClick={() => {
                          setExpanded(exp => {
                            const newExp = { ...exp, [product.ID]: !exp[product.ID] };
                            if (!exp[product.ID]) fetchProductIngredients(product.ID);
                            return newExp;
                          });
                        }}
                      >
                        {expanded[product.ID] ? "Weniger Details" : "weitere Nährwertdetails"}
                      </button>
                      <button
                        className="text-sm text-green-700 hover:underline"
                        onClick={async () => {
                          // Load this product into the form for editing
                          setEditingProductId(product.ID);
                          form.reset({ Produktname: product.Produktname || '', ingredients: [] });
                          // Load existing relations
                          const { data: rels } = await supabase()
                            .from('ProductIngredients')
                            .select('*')
                            .eq('ProductID', product.ID);
                          if (rels && Array.isArray(rels)) {
                            // Clear existing dynamic fields and append loaded ones
                            // react-hook-form field array replace
                            const mapped = rels.map((r: any) => ({
                              IngredientID: String(r.IngredientID),
                              IngredientType: r.IngredientType === 'ingredient' ? 'Zutat' as const : 'Produkt' as const,
                              Amount: Number(r.Amount) || 0,
                            }));
                            // Replace fields using field array API to avoid duplicates
                            replace(mapped as any);
                            // Recalculate nutrients based on loaded relations
                            calculateNutrients(mapped as any);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }
                        }}
                      >
                        Bearbeiten
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded[product.ID] && (
                  <tr>
                    <td colSpan={6} className="bg-gray-50 px-4 py-2">
                      <div className="text-sm">
                        <div className="mb-2 font-semibold">Zutaten:</div>
                        {loadingIngredients[product.ID] && <div>Lade Zutaten...</div>}
                        {!loadingIngredients[product.ID] && productIngredients[product.ID] && productIngredients[product.ID].length > 0 ? (
                          fetchIngredientNames(productIngredients[product.ID]),
                          <ul className="mb-4 list-disc list-inside">
                            {productIngredients[product.ID].map(ing => (
                              ing.IngredientType === 'ingredient' ? (
                                <li key={ing.ID}>
                                  {ingredientNames[`ingredient:${ing.IngredientID}`] || `Zutat: ${ing.IngredientID}`} – <b>{ing.Amount} g</b>
                                </li>
                              ) : (
                                <DecomposedIngredientList key={ing.ID} productId={ing.IngredientID} amount={ing.Amount} />
                              )
                            ))}
                          </ul>
                        ) : !loadingIngredients[product.ID] && <div className="mb-4 text-gray-400">Keine Zutaten gefunden</div>}
                        <div><b>Nährwerte (pro 100g):</b></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
                          {/* Grundlegende Informationen */}
                          <div>
                            <div className="font-semibold mb-1">Grundlegende Informationen</div>
                            {(() => {
                              const keys = [
                                "kJ", "kcal", "Fett", "davon gesättigte Fettsäuren", "davon einfach ungesättigte Fettsäuren", "davon mehrfach ungesättigte Fettsäuren",
                                "Kohlenhydrate", "davon Zucker", "Ballaststoffe", "Eiweiss", "Salz"
                              ];
                              return keys.filter(key => parseNutritionalValue(product[key]) > 0).map(key => (
                                <div key={key}>
                                  {key === "kJ"
                                    ? <>Energie: <b>{parseNutritionalValue(product.kJ).toFixed(1)} kJ / {parseNutritionalValue(product.kcal).toFixed(1)} kcal</b></>
                                    : key === "Fett"
                                    ? <>Fett: <b>{parseNutritionalValue(product.Fett).toFixed(1)} g</b></>
                                    : key === "davon gesättigte Fettsäuren"
                                    ? <>- gesättigt: <b>{parseNutritionalValue(product["davon gesättigte Fettsäuren"]).toFixed(1)} g</b></>
                                    : key === "davon einfach ungesättigte Fettsäuren"
                                    ? <>- einfach ungesättigt: <b>{parseNutritionalValue(product["davon einfach ungesättigte Fettsäuren"]).toFixed(1)} g</b></>
                                    : key === "davon mehrfach ungesättigte Fettsäuren"
                                    ? <>- mehrfach ungesättigt: <b>{parseNutritionalValue(product["davon mehrfach ungesättigte Fettsäuren"]).toFixed(1)} g</b></>
                                    : key === "Kohlenhydrate"
                                    ? <>Kohlenhydrate: <b>{parseNutritionalValue(product.Kohlenhydrate).toFixed(1)} g</b></>
                                    : key === "davon Zucker"
                                    ? <>- davon Zucker: <b>{parseNutritionalValue(product["davon Zucker"]).toFixed(1)} g</b></>
                                    : key === "Ballaststoffe"
                                    ? <>Ballaststoffe: <b>{parseNutritionalValue(product.Ballaststoffe).toFixed(1)} g</b></>
                                    : key === "Eiweiss"
                                    ? <>Eiweiß: <b>{parseNutritionalValue(product.Eiweiss).toFixed(1)} g</b></>
                                    : key === "Salz"
                                    ? <>Salz: <b>{parseNutritionalValue(product.Salz).toFixed(1)} g</b></>
                                    : null}
                                </div>
                              ));
                            })()}
                          </div>
                          {/* Essentielle Fettsäuren */}
                          <div>
                            <div className="font-semibold mb-1">Essentielle Fettsäuren</div>
                            {(() => {
                              const keys = [
                                "mehrfachungesättigte Fettsäuren (n-6)", "Linolsäure (Omega-6-Fettsäuren)", "Alpha-Linolensäure (n-3) Omega3", "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"
                              ];
                              return keys.filter(key => parseNutritionalValue(product[key]) > 0).map(key => (
                                <div key={key}>
                                  {key === "mehrfachungesättigte Fettsäuren (n-6)"
                                    ? `Omega-6-Fettsäuren: ${parseNutritionalValue(product[key]).toFixed(1)} g`
                                    : key === "Linolsäure (Omega-6-Fettsäuren)"
                                    ? `Linolsäure (Omega-6): ${parseNutritionalValue(product[key]).toFixed(1)} g`
                                    : key === "Alpha-Linolensäure (n-3) Omega3"
                                    ? `Alpha-Linolensäure (Omega-3): ${parseNutritionalValue(product[key]).toFixed(1)} g`
                                    : key === "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"
                                    ? `EPA + DHA: ${parseNutritionalValue(product[key]).toFixed(1)} g`
                                    : null}
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                        {/* Vitamine */}
                        <details className="mt-2">
                          <summary className="font-semibold cursor-pointer">Vitamine</summary>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                            {(() => {
                              const keys = [
                                "Vitamin A", "B-Carotin (Provitamin A)", "Vitamin D", "Vitamin E", "Vitamin C", "Vitamin K",
                                "Vitamin B1 (Thiamin)", "Vitamin B2 (Riboflavin)", "Vitamin B3  Niacin (Vitamin PP)", "Vitamin B6",
                                "Folsäure/Folacin", "Vitamin B12", "Biotin", "Pantothensäure"
                              ];
                              return keys.filter(key => parseNutritionalValue(product[key]) > 0).map(key => (
                                <div key={key}>
                                  {key.replace(/\s+/g, ' ')}: <b>{parseNutritionalValue(product[key]).toFixed(1)}</b>
                                </div>
                              ));
                            })()}
                          </div>
                        </details>
                        {/* Mineralstoffe */}
                        <details className="mt-2">
                          <summary className="font-semibold cursor-pointer">Mineralstoffe</summary>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                            {(() => {
                              const keys = [
                                "Calcium", "Phosphor", "Eisen", "Magnesium", "Zink", "Jod", "Selen", "Kupfer", "Mangan", "Chrom", "Molybdän", "Fluorid", "Kalium", "Chlorid"
                              ];
                              return keys.filter(key => parseNutritionalValue(product[key]) > 0).map(key => (
                                <div key={key}>
                                  {key.replace(/\s+/g, ' ')}: <b>{parseNutritionalValue(product[key]).toFixed(1)}</b>
                                </div>
                              ));
                            })()}
                          </div>
                        </details>
                        {/* Sonstige Nährstoffe */}
                        <details className="mt-2">
                          <summary className="font-semibold cursor-pointer">Sonstige Nährstoffe</summary>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                            {(() => {
                              const keys = [
                                "Cholin", "Betain", "Lycopin", "mehrfachungesättigte Fettsäuren (n-6)", "Alpha-Linolensäure (n-3) Omega3",
                                "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH", "Linolsäure (Omega-6-Fettsäuren)"
                              ];
                              return keys.filter(key => parseNutritionalValue(product[key]) > 0).map(key => (
                                <div key={key}>
                                  {key.replace(/\s+/g, ' ')}: <b>{parseNutritionalValue(product[key]).toFixed(1)}</b>
                                </div>
                              ));
                            })()}
                          </div>
                        </details>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visibleProducts.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-gray-400">Keine Produkte gefunden</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filteredProducts.length > showCount && (
        <div className="flex justify-center mt-4">
          <button
            className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm"
            onClick={() => setShowCount(c => c + 10)}
          >
            Mehr anzeigen
          </button>
        </div>
      )}
    </main>
  )
}

function DecomposedIngredientList({ productId, amount }: { productId: number, amount: number }) {
  const [ingredients, setIngredients] = useState<Array<{ name: string; amount: number }>>([]);
  useEffect(() => {
    decomposeProductIngredients(productId, amount).then(setIngredients);
  }, [productId, amount]);
  if (!ingredients.length) return null;
  // Sort by amount descending
  const sorted = [...ingredients].sort((a, b) => b.amount - a.amount);
  return (
    <>
      {sorted.map((item, idx) => (
        <li key={idx}>{item.name} – <b>{item.amount.toFixed(1)} g</b></li>
      ))}
    </>
  );
} 