'use client'

import { createClient } from '@supabase/supabase-js'

declare global {
  interface Window {
    ENV?: {
      NEXT_PUBLIC_SUPABASE_URL?: string
      NEXT_PUBLIC_SUPABASE_ANON_KEY?: string
    }
  }
}

// Create a single supabase client for interacting with your database
export const createBrowserClient = () => {
  if (typeof window === 'undefined') {
    throw new Error('This method should only be called client side');
  }

  const supabaseUrl = window.ENV?.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = window.ENV?.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: true,
    },
  });
}

// Create the client lazily to handle SSR cases properly
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export const supabase = () => {
  if (typeof window === 'undefined') {
    throw new Error('Supabase client cannot be used server-side. Please use the server client instead.');
  }
  
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  
  return browserClient;
} 