'use client'

import { createClient } from '@supabase/supabase-js'

// Create a single supabase client for interacting with your database
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
)

// New type definitions based on actual database schema
export interface NutritionalValues {
  kJ?: string;
  kcal?: string;
  Fett?: string;
  'davon gesättigte Fettsäuren'?: string;
  'davon einfach ungesättigte Fettsäuren'?: string;
  'davon mehrfach ungesättigte Fettsäuren'?: string;
  Kohlenhydrate?: string;
  'davon Zucker'?: string;
  Eiweiss?: string;
  Ballaststoffe?: string;
  Salz?: string;
  'Vitamin A'?: number | string;
  'B-Carotin (Provitamin A)'?: string;
  'Vitamin D'?: string;
  'Vitamin E'?: number | string;
  'Vitamin C'?: number | string;
  'Vitamin K'?: number | string;
  'Vitamin B1 (Thiamin)'?: number | string;
  'Vitamin B2 (Riboflavin)'?: number | string;
  'Vitamin B3  Niacin (Vitamin PP)'?: number | string;
  'Vitamin B6'?: number | string;
  'Folsäure/Folacin'?: number | string;
  'Vitamin B12'?: string;
  Biotin?: number | string;
  Pantothensäure?: number | string;
  Calcium?: number | string;
  Phosphor?: number | string;
  Eisen?: number | string;
  Magnesium?: number | string;
  Zink?: number | string;
  Jod?: string;
  Selen?: string;
  Kupfer?: string;
  Mangan?: string;
  Chrom?: string;
  Molybdän?: string;
  Fluorid?: string;
  Kalium?: number | string;
  Chlorid?: string;
  Cholin?: string;
  Betain?: string;
  Lycopin?: string;
  'mehrfachungesättigte Fettsäuren (n-6)'?: string;
  'Alpha-Linolensäure (n-3) Omega3'?: string;
  'Summe von Eicosapentaensäure und  Docosahexaensäure (EPA + DH'?: string;
  'Linolsäure (Omega-6-Fettsäuren)'?: string;
  [key: string]: string | number | undefined;
}

export interface ZutatenMaster extends NutritionalValues {
  ID: number;
  Name?: string;
  CreatedAt?: string;
}

export interface ProduktMaster extends NutritionalValues {
  ID: number;
  Produktname?: string;
  CreatedAt?: string;
}

export interface ProductIngredients {
  ID: number;
  ProductID?: number;
  IngredientType: 'ingredient' | 'product';
  IngredientID: number;
  Amount: number;
  CreatedAt?: string;
}

// Legacy types for backward compatibility
export interface Ingredient {
  id: number;
  name: string;
  kcal: number;
  proteins: number;
  vitamins: string;
  other_nutrients: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  instructions: string;
  created_at: string;
}

export interface ProductIngredient {
  id: number;
  product_id: number;
  ingredient_id: number;
  quantity: number;
}

export interface RecipeIngredient {
  id: number;
  recipe_id: number;
  ingredient_id: number;
  quantity: number;
}

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