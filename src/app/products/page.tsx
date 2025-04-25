'use client'

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { supabase, ProduktMaster, ZutatenMaster, ProductIngredients, parseNutritionalValue } from "@/lib/supabase"
import { toast } from "@/components/ui/use-toast"
import { useState, useEffect } from "react"
import { X } from "lucide-react"

const productSchema = z.object({
  Produktname: z.string().min(1, "Name is required"),
  ingredients: z.array(z.object({
    IngredientID: z.string(),
    IngredientType: z.enum(['Zutat', 'Produkt']),
    Amount: z.number().min(0, "Amount must be positive"),
  })),
})

type ProductFormValues = z.infer<typeof productSchema>

export default function ProductsPage() {
  const [products, setProducts] = useState<ProduktMaster[]>([])
  const [ingredients, setIngredients] = useState<ZutatenMaster[]>([])
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    fetchProducts()
    fetchIngredients()
  }, [])

  useEffect(() => {
    const ingredients = form.watch("ingredients");
    if (ingredients.length > 0) {
      calculateNutrients(ingredients);
    }
  }, [form.watch("ingredients")]);

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
  const handleAmountChange = (index: number, value: number) => {
    const currentIngredient = form.getValues(`ingredients.${index}`);
    
    if (currentIngredient.IngredientID) {
      // Trigger calculation when amount changes and ingredient is selected
      calculateNutrients(form.getValues('ingredients'));
    }
  };

  // Create a handler for ingredient type changes
  const handleTypeChange = (index: number, value: string) => {
    // Reset the ingredient ID when type changes
    form.setValue(`ingredients.${index}.IngredientID`, "");
    calculateNutrients(form.getValues('ingredients'));
  };

  async function fetchProducts() {
    try {
      const { data, error } = await supabase
        .from('ProduktMaster')
        .select('*')
        .order('ID', { ascending: false })

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error('Error fetching products:', error)
      toast({
        title: "Error",
        description: "Failed to fetch products",
        variant: "destructive",
      })
    }
  }

  async function fetchIngredients() {
    try {
      const { data, error } = await supabase
        .from('ZutatenMaster')
        .select('*')
        .order('Name')

      if (error) throw error
      setIngredients(data || [])
      setLoading(false)
    } catch (error) {
      console.error('Error fetching ingredients:', error)
      toast({
        title: "Error",
        description: "Failed to fetch ingredients",
        variant: "destructive",
      })
    }
  }

  function calculateNutrients(formIngredients: ProductFormValues['ingredients']) {
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
  }

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
      const { data: newProduct, error } = await supabase
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
              const data = {
                ProductID: newProduct.ID,
                IngredientID: ing.IngredientID,
                IngredientType: ing.IngredientType === 'Zutat' ? 'Zutat' : 'Produkt',
                Amount: parseFloat(ing.Amount.toString()) || 0,
              };
              console.log("Prepared ingredient data:", data);
              return data;
            });
            
            console.log("Complete ingredient data to be inserted:", ingredientsToInsert);
            
            const { data: insertedData, error: ingredientsError } = await supabase
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
        description: "Product added successfully",
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
    } catch (error: any) {
      console.error('Error adding product:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add product",
        variant: "destructive",
      })
    }
  }

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
                  <div key={field.id} className="flex gap-2 mb-2">
                    <FormField
                      control={form.control}
                      name={`ingredients.${index}.IngredientType`}
                      render={({ field }) => (
                        <FormItem className="w-1/4">
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              handleTypeChange(index, value);
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
                    
                    <FormField
                      control={form.control}
                      name={`ingredients.${index}.IngredientID`}
                      render={({ field }) => (
                        <FormItem className="w-1/2">
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
                              {form.watch(`ingredients.${index}.IngredientType`) === 'Zutat'
                                ? ingredients.map((ing) => (
                                    <SelectItem key={ing.ID} value={ing.ID.toString()}>
                                      {ing.Name}
                                    </SelectItem>
                                  ))
                                : products.map((prod) => (
                                    <SelectItem key={prod.ID} value={prod.ID.toString()}>
                                      {prod.Produktname}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`ingredients.${index}.Amount`}
                      render={({ field }) => (
                        <FormItem className="w-1/4">
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Amount"
                              {...field}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                field.onChange(value);
                                handleAmountChange(index, value);
                              }}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
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
                    <p>Energie: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.kJ).toFixed(1)} kJ / {parseNutritionalValue(nutritionalValues.kcal).toFixed(1)} kcal</span></p>
                    <p>Fett: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Fett).toFixed(1)} g</span></p>
                    <p>- gesättigt: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon gesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    <p>- einfach ungesättigt: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon einfach ungesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    <p>- mehrfach ungesättigt: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon mehrfach ungesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    <p>Kohlenhydrate: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Kohlenhydrate).toFixed(1)} g</span></p>
                    <p>- davon Zucker: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["davon Zucker"]).toFixed(1)} g</span></p>
                    <p>Ballaststoffe: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Ballaststoffe).toFixed(1)} g</span></p>
                    <p>Eiweiß: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Eiweiss).toFixed(1)} g</span></p>
                    <p>Salz: <span className="font-semibold">{parseNutritionalValue(nutritionalValues.Salz).toFixed(1)} g</span></p>
                  </div>
                  
                  {/* Essential fatty acids */}
                  <div>
                    <h4 className="font-medium mb-1">Essentielle Fettsäuren</h4>
                    <p>Omega-6-Fettsäuren: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["mehrfachungesättigte Fettsäuren (n-6)"]).toFixed(1)} g</span></p>
                    <p>Linolsäure (Omega-6): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Linolsäure (Omega-6-Fettsäuren)"]).toFixed(1)} g</span></p>
                    <p>Alpha-Linolensäure (Omega-3): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Alpha-Linolensäure (n-3) Omega3"]).toFixed(1)} g</span></p>
                    <p>EPA + DHA: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"]).toFixed(1)} g</span></p>
                  </div>
                </div>
                
                <div className="mt-4">
                  <details>
                    <summary className="font-medium cursor-pointer">Vitamine</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-gray-100 rounded">
                      <div>
                        <p>Vitamin A: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin A"]).toFixed(1)}</span></p>
                        <p>B-Carotin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["B-Carotin (Provitamin A)"]).toFixed(1)}</span></p>
                        <p>Vitamin D: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin D"]).toFixed(1)}</span></p>
                        <p>Vitamin E: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin E"]).toFixed(1)}</span></p>
                        <p>Vitamin C: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin C"]).toFixed(1)}</span></p>
                        <p>Vitamin K: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin K"]).toFixed(1)}</span></p>
                      </div>
                      <div>
                        <p>Vitamin B1 (Thiamin): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B1 (Thiamin)"]).toFixed(1)}</span></p>
                        <p>Vitamin B2 (Riboflavin): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B2 (Riboflavin)"]).toFixed(1)}</span></p>
                        <p>Vitamin B3 (Niacin): <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B3  Niacin (Vitamin PP)"]).toFixed(1)}</span></p>
                        <p>Vitamin B6: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B6"]).toFixed(1)}</span></p>
                        <p>Folsäure: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Folsäure/Folacin"]).toFixed(1)}</span></p>
                        <p>Vitamin B12: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Vitamin B12"]).toFixed(1)}</span></p>
                        <p>Biotin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Biotin"]).toFixed(1)}</span></p>
                        <p>Pantothensäure: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Pantothensäure"]).toFixed(1)}</span></p>
                      </div>
                    </div>
                  </details>
                </div>
                
                <div className="mt-2">
                  <details>
                    <summary className="font-medium cursor-pointer">Mineralstoffe</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-gray-100 rounded">
                      <div>
                        <p>Calcium: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Calcium"]).toFixed(1)}</span></p>
                        <p>Phosphor: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Phosphor"]).toFixed(1)}</span></p>
                        <p>Eisen: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Eisen"]).toFixed(1)}</span></p>
                        <p>Magnesium: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Magnesium"]).toFixed(1)}</span></p>
                        <p>Zink: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Zink"]).toFixed(1)}</span></p>
                        <p>Jod: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Jod"]).toFixed(1)}</span></p>
                      </div>
                      <div>
                        <p>Selen: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Selen"]).toFixed(1)}</span></p>
                        <p>Kupfer: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Kupfer"]).toFixed(1)}</span></p>
                        <p>Mangan: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Mangan"]).toFixed(1)}</span></p>
                        <p>Chrom: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Chrom"]).toFixed(1)}</span></p>
                        <p>Molybdän: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Molybdän"]).toFixed(1)}</span></p>
                        <p>Kalium: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Kalium"]).toFixed(1)}</span></p>
                        <p>Chlorid: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Chlorid"]).toFixed(1)}</span></p>
                      </div>
                    </div>
                  </details>
                </div>
                
                <div className="mt-2">
                  <details>
                    <summary className="font-medium cursor-pointer">Sonstige Nährstoffe</summary>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-2 bg-gray-100 rounded">
                      <div>
                        <p>Cholin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Cholin"]).toFixed(1)}</span></p>
                        <p>Betain: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Betain"]).toFixed(1)}</span></p>
                      </div>
                      <div>
                        <p>Lycopin: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Lycopin"]).toFixed(1)}</span></p>
                        <p>Fluorid: <span className="font-semibold">{parseNutritionalValue(nutritionalValues["Fluorid"]).toFixed(1)}</span></p>
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

      <h2 className="text-xl font-bold mt-12 mb-6">Produktliste</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <Card key={product.ID}>
            <CardHeader>
              <CardTitle>{product.Produktname}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Keine Beschreibung verfügbar
              </p>
              <div className="mt-4">
                <p className="font-medium">Nährwerte (pro 100g):</p>
                <p>Energie: <span className="font-semibold">{parseNutritionalValue(product.kJ).toFixed(1)} kJ / {parseNutritionalValue(product.kcal).toFixed(1)} kcal</span></p>
                <p>Eiweiß: <span className="font-semibold">{parseNutritionalValue(product.Eiweiss).toFixed(1)} g</span></p>
                <p>Kohlenhydrate: <span className="font-semibold">{parseNutritionalValue(product.Kohlenhydrate).toFixed(1)} g</span> (Zucker: <span className="font-semibold">{parseNutritionalValue(product["davon Zucker"]).toFixed(1)} g</span>)</p>
                <p>Fett: <span className="font-semibold">{parseNutritionalValue(product.Fett).toFixed(1)} g</span> (gesättigt: <span className="font-semibold">{parseNutritionalValue(product["davon gesättigte Fettsäuren"]).toFixed(1)} g</span>)</p>
                
                <details className="mt-2">
                  <summary className="text-sm font-medium cursor-pointer">Weitere Nährwertdetails</summary>
                  <div className="mt-2 text-sm">
                    <p className="font-medium">Fette:</p>
                    <p>- einfach ungesättigt: <span className="font-semibold">{parseNutritionalValue(product["davon einfach ungesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    <p>- mehrfach ungesättigt: <span className="font-semibold">{parseNutritionalValue(product["davon mehrfach ungesättigte Fettsäuren"]).toFixed(1)} g</span></p>
                    
                    {product["Vitamin A"] && (
                      <div className="mt-2">
                        <p className="font-medium">Vitamine & Mineralstoffe:</p>
                        <div className="grid grid-cols-2 gap-1">
                          {product["Vitamin A"] && <p>Vitamin A: <span className="font-semibold">{parseNutritionalValue(product["Vitamin A"]).toFixed(1)}</span></p>}
                          {product["Vitamin C"] && <p>Vitamin C: <span className="font-semibold">{parseNutritionalValue(product["Vitamin C"]).toFixed(1)}</span></p>}
                          {product["Vitamin D"] && <p>Vitamin D: <span className="font-semibold">{parseNutritionalValue(product["Vitamin D"]).toFixed(1)}</span></p>}
                          {product["Calcium"] && <p>Calcium: <span className="font-semibold">{parseNutritionalValue(product["Calcium"]).toFixed(1)}</span></p>}
                          {product["Eisen"] && <p>Eisen: <span className="font-semibold">{parseNutritionalValue(product["Eisen"]).toFixed(1)}</span></p>}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
} 