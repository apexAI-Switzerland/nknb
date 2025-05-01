'use client'

import { createClient } from '@supabase/supabase-js'

// Create a single supabase client for interacting with your database
export const createBrowserClient = () => {
  // Helper function to clean environment variables
  const cleanEnvVar = (value: string | undefined): string => {
    if (!value) return '';
    // Remove quotes and trim whitespace
    return value.replace(/^["']|["']$/g, '').trim();
  };

  // Try to get environment variables from different possible sources
  const supabaseUrl = cleanEnvVar(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    window.__NEXT_DATA__?.props?.pageProps?.env?.NEXT_PUBLIC_SUPABASE_URL
  );
  
  const supabaseKey = cleanEnvVar(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    window.__NEXT_DATA__?.props?.pageProps?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // More detailed debugging
  console.log('Environment Variables (Debug):', {
    processEnvUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    windowDataUrl: window.__NEXT_DATA__?.props?.pageProps?.env?.NEXT_PUBLIC_SUPABASE_URL,
    cleanedUrl: supabaseUrl,
    hasProcessKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasWindowKey: !!window.__NEXT_DATA__?.props?.pageProps?.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cleanedKeyLength: supabaseKey.length
  });

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration. Available environment:', {
      processEnv: process.env,
      windowData: window.__NEXT_DATA__?.props?.pageProps?.env
    });
    throw new Error(
      `Missing required Supabase environment variables.\nURL: ${supabaseUrl ? 'set' : 'missing'}\nKey: ${supabaseKey ? 'set' : 'missing'}`
    );
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