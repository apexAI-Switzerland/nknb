'use client'

import { useState, useEffect } from 'react'
import { UseFormReturn } from 'react-hook-form'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

type IngredientFormItem = {
  IngredientID: string;
  IngredientType: 'ZutatenMaster' | 'ProduktMaster';
  Amount: number;
};

type IngredientOption = {
  id: string
  name: string
  type: 'ZutatenMaster' | 'ProduktMaster'
}

interface IngredientSelectorProps {
  control: UseFormReturn<{ [key: string]: IngredientFormItem[] }>
  name: string
  label?: string
}

export function IngredientSelector({ control, name, label = "Ingredients and Products" }: IngredientSelectorProps) {
  const [options, setOptions] = useState<IngredientOption[]>([])
  const ingredientsRaw = control.getValues(name)
  const ingredients = Array.isArray(ingredientsRaw) ? ingredientsRaw : []

  useEffect(() => {
    async function fetchOptions() {
      try {
        // Fetch ingredients
        const { data: ingredients, error: ingredientsError } = await supabase
          .from('ZutatenMaster')
          .select('ID, Produktname')
          .order('Produktname')

        if (ingredientsError) throw ingredientsError

        // Fetch products
        const { data: products, error: productsError } = await supabase
          .from('ProduktMaster')
          .select('ID, Produktname')
          .order('Produktname')

        if (productsError) throw productsError

        // Combine and format options
        const formattedOptions: IngredientOption[] = [
          ...(ingredients || []).map(ing => ({
            id: ing.ID,
            name: ing.Produktname,
            type: 'ZutatenMaster' as const
          })),
          ...(products || []).map(prod => ({
            id: prod.ID,
            name: prod.Produktname,
            type: 'ProduktMaster' as const
          }))
        ]

        setOptions(formattedOptions)
      } catch (error) {
        console.error('Error fetching options:', error)
      } finally {

      }
    }

    fetchOptions()
  }, [])

  return (
    <div className="space-y-4">
      <FormLabel>{label}</FormLabel>
      <div className="space-y-4">
        {ingredients.map((_: unknown, index: number) => (
          <div key={index} className="flex items-center gap-4">
            <FormField
              control={control.control}
              name={`${name}.${index}.IngredientID`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Select
                      value={field.value || ''}
                      onValueChange={(value) => {
                        field.onChange(value)
                        // Update the ingredient type
                        const option = options.find(opt => opt.id === value)
                        if (option) {
                          control.setValue(`${name}.${index}.IngredientType`, option.type)
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select ingredient or product" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" disabled>Select ingredient or product</SelectItem>
                        {options.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name} ({String(option.type) === 'ZutatenMaster' ? 'Ingredient' : 'Product'})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control.control}
              name={`${name}.${index}.Amount`}
              render={({ field }) => (
                <FormItem className="w-32">
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Amount (g)"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const currentValue = control.getValues(name)
          const arr = Array.isArray(currentValue) ? currentValue : []
          const newIngredient: IngredientFormItem = { IngredientID: '', IngredientType: 'ZutatenMaster', Amount: 0 }
          control.setValue(name, [...arr, newIngredient])
        }}
      >
        Add Ingredient
      </Button>
    </div>
  )
} 