'use client'

import { ZutatenMaster, ProduktMaster, ProductIngredients, getIngredientOrProduct, parseNutritionalValue } from './supabase'

// Calculate nutritional values for a list of ingredients
export async function calculateNutritionalValues(ingredients: ProductIngredients[]) {
  let totalValues = {
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
    Salz: "0"
  }

  const totalWeight = ingredients.reduce((sum, item) => sum + item.Amount, 0)
  
  // Process each ingredient and accumulate nutritional values
  for (const ingredient of ingredients) {
    const item = await getIngredientOrProduct(ingredient.IngredientID, ingredient.IngredientType as 'Zutat' | 'Produkt')
    
    if (item) {
      const ratio = ingredient.Amount / 100 // Nutritional values are per 100g
      
      const nutritionalKeys = [
        'kJ', 'kcal', 'Fett', 'davon gesättigte Fettsäuren', 
        'davon einfach ungesättigte Fettsäuren', 'davon mehrfach ungesättigte Fettsäuren', 
        'Kohlenhydrate', 'davon Zucker', 'Eiweiss', 'Ballaststoffe', 'Salz'
      ] as const;
      
      nutritionalKeys.forEach(key => {
        const actualKey = key as keyof typeof item;
        // Parse the current accumulated value to a number
        const currentValue = parseNutritionalValue(totalValues[key]);
        // Parse the ingredient value to a number
        const ingredientValue = parseNutritionalValue(item[actualKey] as string);
        // Add the ingredient contribution and convert back to a string
        totalValues[key] = (currentValue + ingredientValue * ratio).toFixed(1);
      });
    }
  }
  
  return { totalValues, totalWeight }
}

// Function to generate a sorted list of ingredients
export function generateIngredientList(ingredients: ProductIngredients[]) {
  // Sort by amount (highest first)
  const sortedIngredients = [...ingredients].sort((a, b) => b.Amount - a.Amount)
  
  return sortedIngredients
}

// Format nutritional information as a table string
export function formatNutritionalTable(values: Record<string, string>, totalWeight: number = 100): string {
  // If totalWeight is provided, calculate per 100g values
  if (totalWeight !== 100) {
    return `
Nährwertdeklaration (pro 100g):
Brennwert: ${Math.round(parseNutritionalValue(values.kJ) / totalWeight * 100)} kJ / ${Math.round(parseNutritionalValue(values.kcal) / totalWeight * 100)} kcal
Fett: ${(parseNutritionalValue(values.Fett) / totalWeight * 100).toFixed(1)}g
  davon gesättigte Fettsäuren: ${(parseNutritionalValue(values["davon gesättigte Fettsäuren"]) / totalWeight * 100).toFixed(1)}g
  davon einfach ungesättigte Fettsäuren: ${(parseNutritionalValue(values["davon einfach ungesättigte Fettsäuren"]) / totalWeight * 100).toFixed(1)}g
  davon mehrfach ungesättigte Fettsäuren: ${(parseNutritionalValue(values["davon mehrfach ungesättigte Fettsäuren"]) / totalWeight * 100).toFixed(1)}g
Kohlenhydrate: ${(parseNutritionalValue(values.Kohlenhydrate) / totalWeight * 100).toFixed(1)}g
  davon Zucker: ${(parseNutritionalValue(values["davon Zucker"]) / totalWeight * 100).toFixed(1)}g
Ballaststoffe: ${(parseNutritionalValue(values.Ballaststoffe) / totalWeight * 100).toFixed(1)}g
Eiweiss: ${(parseNutritionalValue(values.Eiweiss) / totalWeight * 100).toFixed(1)}g
Salz: ${(parseNutritionalValue(values.Salz) / totalWeight * 100).toFixed(1)}g
    `
  }
  
  // If totalWeight is 100 or not provided, use direct values
  return `Nutritional Information per 100g:
Energy: ${parseNutritionalValue(values.kJ).toFixed(1)} kJ / ${parseNutritionalValue(values.kcal).toFixed(1)} kcal
Fat: ${parseNutritionalValue(values.Fett).toFixed(1)}g (Saturated: ${parseNutritionalValue(values["davon gesättigte Fettsäuren"]).toFixed(1)}g)
Carbohydrates: ${parseNutritionalValue(values.Kohlenhydrate).toFixed(1)}g (of which Sugars: ${parseNutritionalValue(values["davon Zucker"]).toFixed(1)}g)
Fiber: ${parseNutritionalValue(values.Ballaststoffe).toFixed(1)}g
Protein: ${parseNutritionalValue(values.Eiweiss).toFixed(1)}g
Salt: ${parseNutritionalValue(values.Salz).toFixed(1)}g`
}

export async function decomposeProduct(
  productId: string,
  quantity: number = 100
): Promise<(ZutatenMaster & { Amount: number; percentage: number })[]> {
  // TODO: Implement recursive decomposition of products
  // This will need to query the database for product ingredients
  // and recursively decompose any semi-finished products
  return []
}

export async function decomposeRecipe(
  recipeId: string,
  quantity: number = 100
): Promise<(ZutatenMaster & { Amount: number; percentage: number })[]> {
  // TODO: Implement recursive decomposition of recipes
  // Similar to decomposeProduct but for recipes
  return []
}

export async function calculateTotalNutritionalValues(productIngredients: ProductIngredients[]): Promise<Record<string, string>> {
  const { totalValues } = await calculateNutritionalValues(productIngredients)
  return totalValues
} 