'use client'

import { createClient } from '@supabase/supabase-js'

// Types for the database tables based on the exact schema
export interface NutritionalValues {
  kJ: string
  kcal: string
  Fett: string
  "davon gesättigte Fettsäuren": string
  "davon einfach ungesättigte Fettsäuren": string
  "davon mehrfach ungesättigte Fettsäuren": string
  Kohlenhydrate: string
  "davon Zucker": string
  Eiweiss: string
  Ballaststoffe: string
  Salz: string
}

export interface ZutatenMaster {
  ID: number
  Name: string
  kJ: string
  kcal: string
  Fett: string
  "davon gesättigte Fettsäuren": string
  "davon einfach ungesättigte Fettsäuren": string
  "davon mehrfach ungesättigte Fettsäuren": string
  Kohlenhydrate: string
  "davon Zucker": string
  Eiweiss: string
  Ballaststoffe: string
  Salz: string
  "Vitamin A"?: string
  "B-Carotin (Provitamin A)"?: string
  "Vitamin D"?: string
  "Vitamin E"?: string
  "Vitamin C"?: string
  "Vitamin K"?: string
  "Vitamin B1 (Thiamin)"?: string
  "Vitamin B2 (Riboflavin)"?: string
  "Vitamin B3  Niacin (Vitamin PP)"?: string
  "Vitamin B6"?: string
  "Folsäure/Folacin"?: string
  "Vitamin B12"?: string
  "Biotin"?: string
  "Pantothensäure"?: string
  "Calcium"?: string
  "Phosphor"?: string
  "Eisen"?: string
  "Magnesium"?: string
  "Zink"?: string
  "Jod"?: string
  "Selen"?: string
  "Kupfer"?: string
  "Mangan"?: string
  "Chrom"?: string
  "Molybdän"?: string
  "Fluorid"?: string
  "Kalium"?: string
  "Chlorid"?: string
  "Cholin"?: string
  "Betain"?: string
  "Lycopin"?: string
  "mehrfachungesättigte Fettsäuren (n-6)"?: string
  "Alpha-Linolensäure (n-3) Omega3"?: string
  "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"?: string
  "Linolsäure (Omega-6-Fettsäuren)"?: string
}

export interface ProduktMaster {
  ID: number
  Produktname: string
  kJ: string
  kcal: string
  Fett: string
  "davon gesättigte Fettsäuren": string
  "davon einfach ungesättigte Fettsäuren": string
  "davon mehrfach ungesättigte Fettsäuren": string
  Kohlenhydrate: string
  "davon Zucker": string
  Eiweiss: string
  Ballaststoffe: string
  Salz: string
  "Vitamin A"?: string
  "B-Carotin (Provitamin A)"?: string
  "Vitamin D"?: string
  "Vitamin E"?: string
  "Vitamin C"?: string
  "Vitamin K"?: string
  "Vitamin B1 (Thiamin)"?: string
  "Vitamin B2 (Riboflavin)"?: string
  "Vitamin B3  Niacin (Vitamin PP)"?: string
  "Vitamin B6"?: string
  "Folsäure/Folacin"?: string
  "Vitamin B12"?: string
  "Biotin"?: string
  "Pantothensäure"?: string
  "Calcium"?: string
  "Phosphor"?: string
  "Eisen"?: string
  "Magnesium"?: string
  "Zink"?: string
  "Jod"?: string
  "Selen"?: string
  "Kupfer"?: string
  "Mangan"?: string
  "Chrom"?: string
  "Molybdän"?: string
  "Fluorid"?: string
  "Kalium"?: string
  "Chlorid"?: string
  "Cholin"?: string
  "Betain"?: string
  "Lycopin"?: string
  "mehrfachungesättigte Fettsäuren (n-6)"?: string
  "Alpha-Linolensäure (n-3) Omega3"?: string
  "Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH"?: string
  "Linolsäure (Omega-6-Fettsäuren)"?: string
}

export interface ProductIngredients {
  ID: number
  ProductID: number
  IngredientID: string  // Based on the image
  IngredientType: string // Based on the image
  Amount: number  // Based on the image
  CreatedAt?: string // Based on the image
}

// Create Supabase client
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// Function to get either an ingredient or a product by ID and type
export async function getIngredientOrProduct(id: string, type: 'Zutat' | 'Produkt'): Promise<ZutatenMaster | ProduktMaster | null> {
  const table = type === 'Zutat' ? 'ZutatenMaster' : 'ProduktMaster'
  
  try {
    console.log(`Fetching ${type} with ID ${id} from table ${table}`);
    
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('ID', id)
      .single()

    if (error) {
      console.error(`Error fetching ${type}:`, error);
      return null;
    }

    console.log(`Successfully fetched ${type}:`, data);
    return data;
  } catch (err) {
    console.error(`Exception in getIngredientOrProduct:`, err);
    return null;
  }
}

// Helper to convert string nutritional values to numbers
export function parseNutritionalValue(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  
  // If value is already a number, return it directly
  if (typeof value === 'number') return value;
  
  // For strings, handle decimal separator and parse
  if (typeof value === 'string') {
    // Replace comma with dot for decimal separator
    const normalized = value.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }
  
  // For any other type, try to convert to number or return 0
  return Number(value) || 0;
}

// Legacy types for backward compatibility - these should be phased out
export interface Ingredient {
  id: string
  name: string
  kcal: number
  proteins: number
  vitamins: number
  other_nutrients: number
  created_at: string
}

export interface Product {
  id: string
  name: string
  description: string
  created_at: string
}

export interface Recipe {
  id: string
  name: string
  description: string
  instructions: string
  created_at: string
}

export interface ProductIngredient {
  id: string
  product_id: string
  ingredient_id: string
  quantity: number
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  ingredient_id: string
  quantity: number
} 