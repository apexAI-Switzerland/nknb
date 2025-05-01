import { createClient } from '@supabase/supabase-js'

export const createServerClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    // Provide default values for build time
    return createClient(
      'https://your-project.supabase.co',
      'your-anon-key'
    )
  }

  return createClient(supabaseUrl, supabaseKey)
} 