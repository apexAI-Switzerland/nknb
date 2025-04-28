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
import { supabase, NutritionalValues } from "@/lib/supabase"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface Ingredient extends NutritionalValues {
  ID: string
  Name: string
  created_at?: string
}

// Create schema based on all nutritional values
const ingredientSchema = z.object({
  Name: z.string().min(1, "Name ist erforderlich"),
  kJ: z.string().optional(),
  kcal: z.string().optional(),
  Fett: z.string().optional(),
  "davon gesättigte Fettsäuren": z.string().optional(),
  "davon einfach ungesättigte Fettsäuren": z.string().optional(),
  "davon mehrfach ungesättigte Fettsäuren": z.string().optional(),
  Kohlenhydrate: z.string().optional(),
  "davon Zucker": z.string().optional(),
  Ballaststoffe: z.string().optional(),
  Eiweiss: z.string().optional(),
  Salz: z.string().optional(),
  "Vitamin A": z.string().optional(),
  "B-Carotin (Provitamin A)": z.string().optional(),
  "Vitamin D": z.string().optional(),
  "Vitamin E": z.string().optional(),
  "Vitamin C": z.string().optional(),
  "Vitamin K": z.string().optional(),
  "Vitamin B1 (Thiamin)": z.string().optional(),
  "Vitamin B2 (Riboflavin)": z.string().optional(),
  "Vitamin B3  Niacin (Vitamin PP)": z.string().optional(),
  "Vitamin B6": z.string().optional(),
  "Folsäure/Folacin": z.string().optional(),
  "Vitamin B12": z.string().optional(),
  Biotin: z.string().optional(),
  Pantothensäure: z.string().optional(),
  Calcium: z.string().optional(),
  Phosphor: z.string().optional(),
  Eisen: z.string().optional(),
  Magnesium: z.string().optional(),
  Zink: z.string().optional(),
  Jod: z.string().optional(),
  Selen: z.string().optional(),
  Kupfer: z.string().optional(),
  Mangan: z.string().optional(),
  Chrom: z.string().optional(),
  Molybdän: z.string().optional(),
  Fluorid: z.string().optional(),
  Kalium: z.string().optional(),
  Chlorid: z.string().optional(),
  Cholin: z.string().optional(),
  Betain: z.string().optional(),
  Lycopin: z.string().optional(),
  "mehrfachungesättigte Fettsäuren (n-6)": z.string().optional(),
  "Alpha-Linolensäure (n-3) Omega3": z.string().optional(),
  "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH": z.string().optional(),
  "Linolsäure (Omega-6-Fettsäuren)": z.string().optional(),
});

type IngredientFormValues = z.infer<typeof ingredientSchema>;

// Group nutritional values for better UI organization
const nutritionalGroups = {
  basic: [
    { name: "Name", label: "Name" },
    { name: "kJ", label: "Energie (kJ)" },
    { name: "kcal", label: "Energie (kcal)" },
    { name: "Fett", label: "Fett (g)" },
    { name: "davon gesättigte Fettsäuren", label: "davon gesättigte Fettsäuren (g)" },
    { name: "davon einfach ungesättigte Fettsäuren", label: "Einfach ungesättigte Fettsäuren (g)" },
    { name: "davon mehrfach ungesättigte Fettsäuren", label: "Mehrfach ungesättigte Fettsäuren (g)" },
    { name: "Kohlenhydrate", label: "Kohlenhydrate (g)" },
    { name: "davon Zucker", label: "davon Zucker (g)" },
    { name: "Ballaststoffe", label: "Ballaststoffe (g)" },
    { name: "Eiweiss", label: "Eiweiß (g)" },
    { name: "Salz", label: "Salz (g)" }
  ],
  vitamins: [
    { name: "Vitamin A", label: "Vitamin A (μg)" },
    { name: "B-Carotin (Provitamin A)", label: "B-Carotin (Provitamin A) (μg)" },
    { name: "Vitamin D", label: "Vitamin D (μg)" },
    { name: "Vitamin E", label: "Vitamin E (mg)" },
    { name: "Vitamin C", label: "Vitamin C (mg)" },
    { name: "Vitamin K", label: "Vitamin K (μg)" },
    { name: "Vitamin B1 (Thiamin)", label: "Vitamin B1 (Thiamin) (mg)" },
    { name: "Vitamin B2 (Riboflavin)", label: "Vitamin B2 (Riboflavin) (mg)" },
    { name: "Vitamin B3  Niacin (Vitamin PP)", label: "Vitamin B3/Niacin (mg)" },
    { name: "Vitamin B6", label: "Vitamin B6 (mg)" },
    { name: "Folsäure/Folacin", label: "Folsäure/Folacin (μg)" },
    { name: "Vitamin B12", label: "Vitamin B12 (μg)" },
    { name: "Biotin", label: "Biotin (μg)" },
    { name: "Pantothensäure", label: "Pantothensäure (mg)" }
  ],
  minerals: [
    { name: "Calcium", label: "Calcium (mg)" },
    { name: "Phosphor", label: "Phosphor (mg)" },
    { name: "Eisen", label: "Eisen (mg)" },
    { name: "Magnesium", label: "Magnesium (mg)" },
    { name: "Zink", label: "Zink (mg)" },
    { name: "Jod", label: "Jod (μg)" },
    { name: "Selen", label: "Selen (μg)" },
    { name: "Kupfer", label: "Kupfer (mg)" },
    { name: "Mangan", label: "Mangan (mg)" },
    { name: "Chrom", label: "Chrom (μg)" },
    { name: "Molybdän", label: "Molybdän (μg)" },
    { name: "Fluorid", label: "Fluorid (mg)" },
    { name: "Kalium", label: "Kalium (mg)" },
    { name: "Chlorid", label: "Chlorid (mg)" }
  ],
  others: [
    { name: "Cholin", label: "Cholin (mg)" },
    { name: "Betain", label: "Betain (mg)" },
    { name: "Lycopin", label: "Lycopin (μg)" },
    { name: "mehrfachungesättigte Fettsäuren (n-6)", label: "Mehrfachungesättigte Fettsäuren (n-6) (g)" },
    { name: "Alpha-Linolensäure (n-3) Omega3", label: "Alpha-Linolensäure (n-3) Omega3 (g)" },
    { name: "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH", label: "EPA + DHA (g)" },
    { name: "Linolsäure (Omega-6-Fettsäuren)", label: "Linolsäure (Omega-6) (g)" }
  ]
};

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const form = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      Name: "",
      kJ: "0",
      kcal: "0",
      Fett: "0",
      "davon gesättigte Fettsäuren": "0",
      "davon einfach ungesättigte Fettsäuren": "0",
      "davon mehrfach ungesättigte Fettsäuren": "0",
      Kohlenhydrate: "0",
      "davon Zucker": "0",
      Ballaststoffe: "0",
      Eiweiss: "0",
      Salz: "0",
      // Optional defaults for other fields are initialized to "0" or empty
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
        .order('Name')

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
        .insert([data])

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
    ingredient.Name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Determine which ingredients to display
  const displayIngredients = searchTerm 
    ? filteredIngredients
    : showAll 
      ? filteredIngredients
      : filteredIngredients.slice(0, 5)

  const hasMoreIngredients = !searchTerm && !showAll && filteredIngredients.length > 5

  // Render FormField components for a group of nutritional values
  const renderFormFields = (group: Array<{name: string, label: string}>) => {
    return group.map(field => (
      <FormField
        key={field.name}
        control={form.control}
        name={field.name as keyof IngredientFormValues}
        render={({ field: formField }) => (
          <FormItem>
            <FormLabel>{field.label}</FormLabel>
            <FormControl>
              <Input
                type={field.name === "Name" ? "text" : "number"}
                step="0.01"
                placeholder={`${field.label} eingeben`}
                {...formField}
                onChange={(e) => formField.onChange(e.target.value)}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    ));
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 naturkostbar-accent">Zutaten</h1>
      
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
          ) : displayIngredients.length > 0 ? (
            displayIngredients.map((ingredient) => (
              <Card 
                key={ingredient.ID} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openIngredientDetails(ingredient)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg naturkostbar-accent">{ingredient.Name}</CardTitle>
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
        
        {hasMoreIngredients && (
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setShowAll(true)}
          >
            Alle Zutaten anzeigen ({filteredIngredients.length})
          </Button>
        )}
        
        {showAll && !searchTerm && (
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => setShowAll(false)}
          >
            Weniger anzeigen
          </Button>
        )}
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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="basic">
                <TabsList className="mb-4">
                  <TabsTrigger value="basic">Grundwerte</TabsTrigger>
                  <TabsTrigger value="vitamins">Vitamine</TabsTrigger>
                  <TabsTrigger value="minerals">Mineralstoffe</TabsTrigger>
                  <TabsTrigger value="others">Sonstige</TabsTrigger>
                </TabsList>
                
                <TabsContent value="basic" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderFormFields(nutritionalGroups.basic)}
                  </div>
                </TabsContent>
                
                <TabsContent value="vitamins" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderFormFields(nutritionalGroups.vitamins)}
                  </div>
                </TabsContent>
                
                <TabsContent value="minerals" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderFormFields(nutritionalGroups.minerals)}
                  </div>
                </TabsContent>
                
                <TabsContent value="others" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderFormFields(nutritionalGroups.others)}
                  </div>
                </TabsContent>
              </Tabs>

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
                <DialogTitle className="text-2xl">{selectedIngredient.Name}</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <Tabs defaultValue="basic">
                  <TabsList>
                    <TabsTrigger value="basic">Grundwerte</TabsTrigger>
                    <TabsTrigger value="vitamins">Vitamine</TabsTrigger>
                    <TabsTrigger value="minerals">Mineralstoffe</TabsTrigger>
                    <TabsTrigger value="others">Sonstige</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="basic" className="mt-4">
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
                          <span>{selectedIngredient["davon gesättigte Fettsäuren"]}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span>davon einfach ungesättigte Fettsäuren:</span>
                          <span>{selectedIngredient["davon einfach ungesättigte Fettsäuren"]}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span>davon mehrfach ungesättigte Fettsäuren:</span>
                          <span>{selectedIngredient["davon mehrfach ungesättigte Fettsäuren"]}g</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Kohlenhydrate:</span>
                          <span>{selectedIngredient.Kohlenhydrate}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span>davon Zucker:</span>
                          <span>{selectedIngredient["davon Zucker"]}g</span>
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
                  </TabsContent>
                  
                  <TabsContent value="vitamins" className="mt-4">
                    <div className="grid grid-cols-2 gap-2">
                      {nutritionalGroups.vitamins.map(field => (
                        <div key={field.name} className="flex justify-between">
                          <span>{field.label}:</span>
                          <span>{selectedIngredient[field.name as keyof Ingredient] || '0'}</span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="minerals" className="mt-4">
                    <div className="grid grid-cols-2 gap-2">
                      {nutritionalGroups.minerals.map(field => (
                        <div key={field.name} className="flex justify-between">
                          <span>{field.label}:</span>
                          <span>{selectedIngredient[field.name as keyof Ingredient] || '0'}</span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="others" className="mt-4">
                    <div className="grid grid-cols-2 gap-2">
                      {nutritionalGroups.others.map(field => (
                        <div key={field.name} className="flex justify-between">
                          <span>{field.label}:</span>
                          <span>{selectedIngredient[field.name as keyof Ingredient] || '0'}</span>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
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