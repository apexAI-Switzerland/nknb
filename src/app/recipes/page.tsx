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
import { Textarea } from "@/components/ui/textarea"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useFieldArray } from "react-hook-form"
import * as z from "zod"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/use-toast"
import { useState, useEffect } from "react"
import { X } from "lucide-react"

interface NutritionalValues {
  kJ: number
  kcal: number
  Fett: number
  GFS: number
  MFS: number
  PFS: number
  Kohlenhydrate: number
  davonZucker: number
  Ballaststoffe: number
  Eiweiss: number
  Salz: number
}

interface Ingredient extends NutritionalValues {
  ID: number
  Produktname: string
}

interface Product extends Ingredient {
  Beschreibung: string | null
  created_at: string
}

const recipeSchema = z.object({
  Produktname: z.string().min(1, "Name is required"),
  Beschreibung: z.string().optional(),
  Anleitung: z.string().min(1, "Instructions are required"),
  ingredients: z.array(z.object({
    ingredientId: z.string(),
    type: z.enum(['Zutat', 'Produkt']),
    amount: z.number().min(0, "Amount must be positive"),
  })),
})

type RecipeFormValues = z.infer<typeof recipeSchema>

export default function RecipesPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [nutritionalValues, setNutritionalValues] = useState<NutritionalValues>({
    kJ: 0,
    kcal: 0,
    Fett: 0,
    GFS: 0,
    MFS: 0,
    PFS: 0,
    Kohlenhydrate: 0,
    davonZucker: 0,
    Ballaststoffe: 0,
    Eiweiss: 0,
    Salz: 0,
  })

  const form = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: {
      Produktname: "",
      Beschreibung: "",
      Anleitung: "",
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
    calculateNutrients(form.watch("ingredients"))
  }, [form.watch("ingredients")])

  async function fetchProducts() {
    try {
      const { data, error } = await supabase
        .from('ProduktMaster')
        .select('*')
        .order('Produktname')

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
        .order('Produktname')

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

  function calculateNutrients(formIngredients: RecipeFormValues['ingredients']) {
    const values: NutritionalValues = {
      kJ: 0,
      kcal: 0,
      Fett: 0,
      GFS: 0,
      MFS: 0,
      PFS: 0,
      Kohlenhydrate: 0,
      davonZucker: 0,
      Ballaststoffe: 0,
      Eiweiss: 0,
      Salz: 0,
    }

    const nutritionalKeys: Array<keyof NutritionalValues> = [
      'kJ', 'kcal', 'Fett', 'GFS', 'MFS', 'PFS', 
      'Kohlenhydrate', 'davonZucker', 'Ballaststoffe', 
      'Eiweiss', 'Salz'
    ]

    formIngredients.forEach(item => {
      const source = item.type === 'Zutat' ? ingredients : products
      const ingredient = source.find(i => i.ID.toString() === item.ingredientId)

      if (ingredient) {
        const multiplier = item.amount / 100 // Convert to percentage
        nutritionalKeys.forEach(key => {
          values[key] += ingredient[key] * multiplier
        })
      }
    })

    setNutritionalValues(values)
  }

  async function onSubmit(data: RecipeFormValues) {
    try {
      // First, create the recipe
      const { data: newRecipe, error } = await supabase
        .from('RezeptMaster')
        .insert({
          Produktname: data.Produktname,
          Beschreibung: data.Beschreibung,
          Anleitung: data.Anleitung,
          ...nutritionalValues,
        })
        .select()
        .single()

      if (error) throw error

      // Then, insert ingredient relationships
      if (data.ingredients.length > 0 && newRecipe) {
        const { error: ingredientsError } = await supabase
          .from('RecipeIngredients')
          .insert(
            data.ingredients.map(ing => ({
              RecipeID: newRecipe.ID,
              IngredientID: ing.ingredientId,
              IngredientType: ing.type,
              Amount: ing.amount,
            }))
          )

        if (ingredientsError) throw ingredientsError
      }

      toast({
        title: "Success",
        description: "Recipe added successfully",
      })

      form.reset()
    } catch (error) {
      console.error('Error adding recipe:', error)
      toast({
        title: "Error",
        description: "Failed to add recipe",
        variant: "destructive",
      })
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 naturkostbar-accent">Rezept erfassen</h1>
      
      <Card>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="Produktname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Rezeptname eingeben" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="Beschreibung"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Input placeholder="Kurze Beschreibung eingeben" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <h2 className="text-lg font-semibold mb-2">Zutaten</h2>
                <div className="flex gap-2 mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => append({ type: 'Zutat', ingredientId: '', amount: 0 })}
                  >
                    + Zutat hinzufügen
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => append({ type: 'Produkt', ingredientId: '', amount: 0 })}
                  >
                    + Produkt hinzufügen
                  </Button>
                </div>

                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-4">
                      <div className="w-24 h-6 rounded px-2 text-sm flex items-center justify-center bg-muted">
                        {form.watch(`ingredients.${index}.type`)}
                      </div>
                      <FormField
                        control={form.control}
                        name={`ingredients.${index}.ingredientId`}
                        render={({ field }) => (
                          <FormItem className="flex-1">
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder={`${form.watch(`ingredients.${index}.type`)} wählen...`} />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(form.watch(`ingredients.${index}.type`) === 'Zutat' ? ingredients : products).map((item) => (
                                  <SelectItem key={item.ID} value={item.ID.toString()}>
                                    {item.Produktname}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`ingredients.${index}.amount`}
                        render={({ field }) => (
                          <FormItem className="w-32">
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={e => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <FormField
                control={form.control}
                name="Anleitung"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Anleitung</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Beschreibe die Zubereitungsschritte..." 
                        className="min-h-[200px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Energie:</span>
                    <span>{nutritionalValues.kcal.toFixed(1)} kcal / {nutritionalValues.kJ.toFixed(1)} kJ</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fett:</span>
                    <span>{nutritionalValues.Fett.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>davon gesättigte Fettsäuren:</span>
                    <span>{nutritionalValues.GFS.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>davon mehrfach ungesättigte Fettsäuren:</span>
                    <span>{nutritionalValues.MFS.toFixed(1)}g</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Kohlenhydrate:</span>
                    <span>{nutritionalValues.Kohlenhydrate.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>davon Zucker:</span>
                    <span>{nutritionalValues.davonZucker.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ballaststoffe:</span>
                    <span>{nutritionalValues.Ballaststoffe.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Eiweiß:</span>
                    <span>{nutritionalValues.Eiweiss.toFixed(1)}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Salz:</span>
                    <span>{nutritionalValues.Salz.toFixed(1)}g</span>
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full">Rezept speichern</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  )
} 