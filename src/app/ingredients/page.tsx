'use client'

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { supabase } from "@/lib/supabase"
import { toast } from "@/components/ui/use-toast"
import { useState, useEffect } from "react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogClose
} from "@/components/ui/dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Ingredient {
  ID: string
  Produktname: string
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
  created_at: string
}

const ingredientSchema = z.object({
  Produktname: z.string().min(1, "Name is required"),
  kJ: z.number().min(0, "Energy must be positive"),
  kcal: z.number().min(0, "Calories must be positive"),
  Fett: z.number().min(0, "Fat must be positive"),
  GFS: z.number().min(0, "Saturated fat must be positive"),
  MFS: z.number().min(0, "Mono-unsaturated fat must be positive"),
  PFS: z.number().min(0, "Poly-unsaturated fat must be positive"),
  Kohlenhydrate: z.number().min(0, "Carbohydrates must be positive"),
  davonZucker: z.number().min(0, "Sugar must be positive"),
  Ballaststoffe: z.number().min(0, "Fiber must be positive"),
  Eiweiss: z.number().min(0, "Protein must be positive"),
  Salz: z.number().min(0, "Salt must be positive"),
})

type IngredientFormValues = z.infer<typeof ingredientSchema>

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const form = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      Produktname: "",
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
    },
  })

  useEffect(() => {
    fetchIngredients()
  }, [])

  async function fetchIngredients() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('ZutatenMaster')
        .select('*')
        .order('Produktname')

      if (error) throw error
      setIngredients(data || [])
    } catch (error) {
      console.error('Error fetching ingredients:', error)
      toast({
        title: "Error",
        description: "Failed to fetch ingredients",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(data: IngredientFormValues) {
    try {
      const { error } = await supabase
        .from('ZutatenMaster')
        .insert(data)

      if (error) throw error

      toast({
        title: "Success",
        description: "Ingredient added successfully",
      })

      form.reset()
      fetchIngredients()
    } catch (error) {
      console.error('Error adding ingredient:', error)
      toast({
        title: "Error",
        description: "Failed to add ingredient",
        variant: "destructive",
      })
    }
  }

  const openIngredientDetails = (ingredient: Ingredient) => {
    setSelectedIngredient(ingredient)
    setIsDialogOpen(true)
  }

  const filteredIngredients = ingredients.filter(ingredient => 
    ingredient.Produktname.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Zutaten</h1>
      
      <div className="mb-8">
        <Input
          className="max-w-xl mb-4"
          placeholder="Zutat suchen..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? (
            <p>Loading...</p>
          ) : filteredIngredients.length > 0 ? (
            filteredIngredients.map((ingredient) => (
              <Card 
                key={ingredient.ID} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openIngredientDetails(ingredient)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{ingredient.Produktname}</CardTitle>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <div className="text-muted-foreground">Energie</div>
                    <div className="text-right">
                      {ingredient.kcal} kcal / {ingredient.kJ} kJ
                    </div>
                    
                    <div className="text-muted-foreground">Fett</div>
                    <div className="text-right">{ingredient.Fett}g</div>
                    
                    <div className="text-muted-foreground">Kohlenhydrate</div>
                    <div className="text-right">{ingredient.Kohlenhydrate}g</div>
                    
                    <div className="text-muted-foreground">Eiweiß</div>
                    <div className="text-right">{ingredient.Eiweiss}g</div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <p>No ingredients found</p>
          )}
        </div>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Neue Zutat erfassen</CardTitle>
          <CardDescription>
            Nährwerte pro 100g eingeben
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="Produktname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Name der Zutat eingeben" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FormField
                    control={form.control}
                    name="kJ"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Energie (kJ)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="kJ eingeben"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                  <FormField
                    control={form.control}
                    name="kcal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Kalorien (kcal)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="kcal eingeben"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="Fett"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fett (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Fett eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="GFS"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gesättigte Fettsäuren (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="GFS eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="MFS"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Einfach ungesättigte Fettsäuren (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="MFS eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="PFS"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mehrfach ungesättigte Fettsäuren (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="PFS eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="Kohlenhydrate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kohlenhydrate (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Kohlenhydrate eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="davonZucker"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>davon Zucker (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Zucker eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="Ballaststoffe"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ballaststoffe (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Ballaststoffe eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="Eiweiss"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Eiweiß (g)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Eiweiß eingeben"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="Salz"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salz (g)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Salz eingeben"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full">Zutat speichern</Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Ingredient Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open: boolean) => setIsDialogOpen(open)}>
        <DialogContent className="max-w-3xl">
          {selectedIngredient && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedIngredient.Produktname}</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <h3 className="text-xl font-semibold mb-4">Nährwerte</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Energie:</span>
                      <span>{selectedIngredient.kcal} kcal / {selectedIngredient.kJ} kJ</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fett:</span>
                      <span>{selectedIngredient.Fett}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>davon gesättigte Fettsäuren:</span>
                      <span>{selectedIngredient.GFS}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>davon einfach ungesättigte Fettsäuren:</span>
                      <span>{selectedIngredient.MFS}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>davon mehrfach ungesättigte Fettsäuren:</span>
                      <span>{selectedIngredient.PFS}g</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Kohlenhydrate:</span>
                      <span>{selectedIngredient.Kohlenhydrate}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>davon Zucker:</span>
                      <span>{selectedIngredient.davonZucker}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ballaststoffe:</span>
                      <span>{selectedIngredient.Ballaststoffe}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Eiweiß:</span>
                      <span>{selectedIngredient.Eiweiss}g</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Salz:</span>
                      <span>{selectedIngredient.Salz}g</span>
                    </div>
                  </div>
                </div>
              </div>
              <DialogClose asChild>
                <Button className="mt-4">Schließen</Button>
              </DialogClose>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
} 