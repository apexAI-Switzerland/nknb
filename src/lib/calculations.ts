'use client'

import { supabase, NutritionalValues, ZutatenMaster, ProduktMaster, ProductIngredients, parseNutritionalValue } from './supabase'

// Calculate nutritional values based on amount
export const calculateNutritionalValues = (
  ingredient: ZutatenMaster | ProduktMaster,
  amount: number
): NutritionalValues => {
  const result: NutritionalValues = {};
  
  // Calculate values for each nutritional property
  Object.entries(ingredient).forEach(([key, value]) => {
    // Skip non-nutritional properties
    if (["ID", "Name", "Produktname", "CreatedAt"].includes(key)) {
      return;
    }
    
    // Convert string values to numbers, handle possible undefined values
    const numericValue = value ? parseFloat(value.toString()) : 0;
    if (!isNaN(numericValue)) {
      // Calculate proportional value based on amount
      const calculatedValue = (numericValue * amount) / 100;
      // Convert back to string for NutritionalValues type
      const nutritionalKey = key as keyof NutritionalValues;
      if (nutritionalKey) {
        // Ensure we're storing string values for the nutritionalValues object
        result[nutritionalKey] = calculatedValue.toFixed(2);
      }
    }
  });

  return result;
};

// Placeholder for future implementation
export const decomposeProduct = async (productId: number) => {
  // Implementation to recursively get all ingredients from a product
  console.log("Decomposing product", productId);
};

// Placeholder for future implementation
export const decomposeRecipe = async (recipeId: number) => {
  // Implementation to recursively get all ingredients from a recipe
  console.log("Decomposing recipe", recipeId);
};

// Generate a sorted list of ingredients by percentage
export const generateIngredientList = (
  items: Array<{ name: string; amount: number }>,
  totalAmount: number
): string => {
  // Sort by amount descending
  const sortedItems = [...items].sort((a, b) => b.amount - a.amount);
  
  // Generate the list with percentages
  return sortedItems
    .map((item) => {
      const percentage = (item.amount / totalAmount) * 100;
      return `${item.name} (${percentage.toFixed(1)}%)`;
    })
    .join(", ");
};

// Format nutritional values into a table string
export const formatNutritionalTable = (nutritionalValues: NutritionalValues): string => {
  const rows = Object.entries(nutritionalValues)
    .filter(([key]) => !["ID", "Name", "Produktname", "CreatedAt"].includes(key))
    .map(([key, value]) => {
      // Format the value, handling undefined values
      const formattedValue = value !== undefined ? String(value) : "0";
      return `${key}: ${formattedValue}`;
    });

  return rows.join("\n");
};

// Get ingredient or product from Supabase by ID and type
export const getIngredientOrProduct = async (
  id: number,
  type: 'ingredient' | 'product'
): Promise<ZutatenMaster | ProduktMaster | null> => {
  try {
    if (type === 'ingredient') {
      const { data, error } = await supabase
        .from('ZutatenMaster')
        .select('*')
        .eq('ID', id)
        .single();
      
      if (error) throw error;
      return data as ZutatenMaster;
    } else {
      const { data, error } = await supabase
        .from('ProduktMaster')
        .select('*')
        .eq('ID', id)
        .single();
      
      if (error) throw error;
      return data as ProduktMaster;
    }
  } catch (error) {
    console.error('Error fetching item:', error);
    return null;
  }
};

// Calculate total nutritional values for a list of product ingredients
export const calculateTotalNutritionalValues = async (
  ingredients: ProductIngredients[]
): Promise<NutritionalValues> => {
  // Fetch full details for each ingredient
  const ingredientsWithDetails = await Promise.all(
    ingredients.map(async (ingredient) => {
      const details = await getIngredientOrProduct(
        ingredient.IngredientID,
        ingredient.IngredientType === 'ingredient' ? 'ingredient' : 'product'
      );
      return {
        details,
        amount: ingredient.Amount
      };
    })
  );

  // Calculate total nutritional values
  const totalValues: NutritionalValues = {};
  
  // Process ingredients with valid details
  ingredientsWithDetails
    .filter(item => item.details !== null)
    .forEach(item => {
      if (!item.details) return;
      
      const values = calculateNutritionalValues(item.details, item.amount);
      
      // Sum up values for each nutritional property
      Object.entries(values).forEach(([key, valueStr]) => {
        // Convert string to number for calculation
        const numValue = parseFloat(String(valueStr));
        const nutritionalKey = key as keyof NutritionalValues;
        const existingValue = parseFloat(String(totalValues[nutritionalKey] || '0'));
        
        if (!isNaN(numValue) && nutritionalKey) {
          // Store result as string
          totalValues[nutritionalKey] = (existingValue + numValue).toFixed(2);
        }
      });
    });

  return totalValues;
}; 