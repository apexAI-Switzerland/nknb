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
import { toast } from "@/components/ui/use-toast"
import { useState, useEffect, useCallback } from "react"
import { X } from "lucide-react"
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

export default function ProductsPage() {
  const [products, setProducts] = useState<ProduktMaster[]>([])
  const [ingredients, setIngredients] = useState<ZutatenMaster[]>([])
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

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "ingredients",
  })

  // Add local search state for each ingredient dropdown
  const [ingredientSearch, setIngredientSearch] = useState<{ [key: number]: string }>({});

  const [productSearch, setProductSearch] = useState("");
  const [showCount, setShowCount] = useState(10);
  const [expanded, setExpanded] = useState<{ [key: number]: boolean }>({});
  const [productIngredients, setProductIngredients] = useState<{ [key: number]: IngredientRelation[] }>({});
  const [loadingIngredients, setLoadingIngredients] = useState<{ [key: number]: boolean }>({});
  const [ingredientNames, setIngredientNames] = useState<{ [key: string]: string }>({});

  // Add state for decomposed ingredients
  const [decomposedIngredients, setDecomposedIngredients] = useState<{ [key: number]: Array<{ name: string; amount: number }> }>({});

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
      
      // First, create the product
      const { data: newProduct, error } = await supabase()
        .from('ProduktMaster')
        .insert({
          Produktname: data.Produktname,
          // Include all nutritional values
          ...sanitizedValues
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating product:', error);
        throw error;
      }

      console.log("Product created successfully:", newProduct);

      // Then, insert ingredient relationships
      if (data.ingredients.length > 0 && newProduct) {
        console.log("New product ID:", newProduct.ID);
        // Filter out ingredients with empty IDs
        const validIngredients = data.ingredients.filter(ing => ing.IngredientID !== "");
        console.log("Valid ingredients for insertion:", validIngredients);
        if (validIngredients.length > 0) {
          try {
            // Prepare the data to be inserted
            const ingredientsToInsert = validIngredients.map(ing => {
              const type = ing.IngredientType === 'Zutat' ? 'ingredient' : 'product';
              const data = {
                ProductID: newProduct.ID,
                IngredientID: ing.IngredientID,
                IngredientType: type,
                Amount: parseFloat(ing.Amount.toString()) || 0,
              };
              console.log("Prepared ingredient data:", data);
              return data;
            });
            console.log("Complete ingredient data to be inserted:", ingredientsToInsert);
            const { data: insertedData, error: ingredientsError } = await supabase()
              .from('ProductIngredients')
              .insert(ingredientsToInsert)
              .select();
            if (ingredientsError) {
              console.error("Error inserting ingredients:", ingredientsError);
              toast({
                title: "Error adding ingredients",
                description: JSON.stringify(ingredientsError),
                variant: "destructive",
              });
            } else {
              console.log("Successfully inserted ingredients:", insertedData);
            }
          } catch (err) {
            console.error("Exception when inserting ingredients:", err);
            toast({
              title: "Error adding ingredients",
              description: "An unexpected error occurred: " + (err instanceof Error ? err.message : String(err)),
              variant: "destructive",
            });
          }
        }
      }

      toast({
        title: "Success",
        description: "Produkt erfolgreich erstell",
      })

      // Fetch products immediately to update the UI
      await fetchProducts()
      
      // Reset the form
      form.reset()
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
  async function fetchProductIngredients(productId: number) {
    if (productIngredients[productId]) return; // Already fetched
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

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Produkt erfassen</h1>
      
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
                  <div key={field.id} className="flex gap-2 mb-2 items-start">
                    {/* Dropdown (Zutat/Produkt) */}
                    <div className="flex items-center h-full w-1/4 min-w-[120px]">
                    <FormField
                      control={form.control}
                      name={`ingredients.${index}.IngredientType`}
                      render={({ field }) => (
                          <FormItem className="w-full">
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                                handleTypeChange(index);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Type" />
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
                    {/* Search + Select stacked */}
                    <div className="flex flex-col flex-1 gap-1">
                      <input
                        type="text"
                        placeholder="Suchen..."
                        className="px-2 py-1 border rounded text-sm"
                        value={ingredientSearch[index] || ""}
                        onChange={e => setIngredientSearch(s => ({ ...s, [index]: e.target.value }))}
                        style={{ minWidth: 0 }}
                      />
                    <FormField
                      control={form.control}
                      name={`ingredients.${index}.IngredientID`}
                      render={({ field }) => (
                          <FormItem className="w-full">
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              handleIngredientChange(index, value);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select ingredient" />
                            </SelectTrigger>
                            <SelectContent>
                                {(form.watch(`ingredients.${index}.IngredientType`) === 'Zutat'
                                  ? ingredients.filter(ing =>
                                      (!ingredientSearch[index] ||
                                        (typeof ing.Name === 'string' && ing.Name.toLowerCase().includes(ingredientSearch[index].toLowerCase()))
                                      )
                                    )
                                  : products.filter(prod =>
                                      (!ingredientSearch[index] ||
                                        (typeof prod.Produktname === 'string' && prod.Produktname.toLowerCase().includes(ingredientSearch[index].toLowerCase()))
                                      )
                                    )
                                ).map(item => (
                                  <SelectItem key={item.ID} value={item.ID.toString()}>
                                    {form.watch(`ingredients.${index}.IngredientType`) === 'Zutat' ? item.Name : item.Produktname}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    </div>
                    {/* Amount input + g */}
                    <div className="flex items-center gap-2 w-1/4 min-w-[120px]">
                    <FormField
                      control={form.control}
                      name={`ingredients.${index}.Amount`}
                      render={({ field }) => (
                          <FormItem className="w-full">
                          <FormControl>
                              <div className="flex items-center gap-2">
                            <Input
                              type="number"
                                  placeholder="Menge"
                              {...field}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                field.onChange(value);
                                    handleAmountChange(index);
                              }}
                            />
                                <span className="text-gray-400 text-xs">g</span>
                              </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    </div>
                    {/* Remove button */}
                    <div className="flex items-center h-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => remove(index)}
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
                  className="mt-2"
                >
                  Zutat hinzufügen
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

              <Button type="submit" className="w-full">
                Produkt speichern
              </Button>
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
              <>
                <tr key={product.ID} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{product.Produktname}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.kcal).toFixed(1)}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.Fett).toFixed(1)}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.Kohlenhydrate).toFixed(1)}</td>
                  <td className="px-4 py-2">{parseNutritionalValue(product.Eiweiss).toFixed(1)}</td>
                  <td className="px-4 py-2">
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
                                    ? `Energie: ${parseNutritionalValue(product.kJ).toFixed(1)} kJ / ${parseNutritionalValue(product.kcal).toFixed(1)} kcal`
                                    : key === "Fett"
                                    ? `Fett: ${parseNutritionalValue(product.Fett).toFixed(1)} g`
                                    : key === "davon gesättigte Fettsäuren"
                                    ? `- gesättigt: ${parseNutritionalValue(product["davon gesättigte Fettsäuren"]).toFixed(1)} g`
                                    : key === "davon einfach ungesättigte Fettsäuren"
                                    ? `- einfach ungesättigt: ${parseNutritionalValue(product["davon einfach ungesättigte Fettsäuren"]).toFixed(1)} g`
                                    : key === "davon mehrfach ungesättigte Fettsäuren"
                                    ? `- mehrfach ungesättigt: ${parseNutritionalValue(product["davon mehrfach ungesättigte Fettsäuren"]).toFixed(1)} g`
                                    : key === "Kohlenhydrate"
                                    ? `Kohlenhydrate: ${parseNutritionalValue(product.Kohlenhydrate).toFixed(1)} g`
                                    : key === "davon Zucker"
                                    ? `- davon Zucker: ${parseNutritionalValue(product["davon Zucker"]).toFixed(1)} g`
                                    : key === "Ballaststoffe"
                                    ? `Ballaststoffe: ${parseNutritionalValue(product.Ballaststoffe).toFixed(1)} g`
                                    : key === "Eiweiss"
                                    ? `Eiweiß: ${parseNutritionalValue(product.Eiweiss).toFixed(1)} g`
                                    : key === "Salz"
                                    ? `Salz: ${parseNutritionalValue(product.Salz).toFixed(1)} g`
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
              </>
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