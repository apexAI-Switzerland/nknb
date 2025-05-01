'use client';

import { supabase } from './supabase/client';

export async function signInWithEmail(email: string, password: string) {
  return await supabase().auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return await supabase().auth.signOut();
}

export async function signUp(email: string, password: string) {
  return await supabase().auth.signUp({ email, password });
}

export async function getSession() {
  return await supabase().auth.getSession();
} 