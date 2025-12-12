import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const cookieClient = createRouteHandlerClient({ cookies })
    let { data: authData } = await cookieClient.auth.getUser()
    let supabase = cookieClient as ReturnType<typeof createRouteHandlerClient>
    
    if (!authData?.user) {
      const authHeader = req.headers.get('authorization') || ''
      const match = authHeader.match(/^Bearer\s+(.+)$/i)
      const token = match?.[1]
      if (token && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        const headerClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          { global: { headers: { Authorization: `Bearer ${token}` } } }
        )
        const userRes = await headerClient.auth.getUser(token)
        if (userRes.data.user) {
          authData = userRes.data
          // @ts-ignore
          supabase = headerClient
        }
      }
    }
    
    if (!authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { id, field, value } = body
    
    if (!id || !field) {
      return NextResponse.json({ error: 'Missing id or field' }, { status: 400 })
    }

    // Validate allowed fields
    const allowedFields = ['herkunft', 'lieferant', 'lieferzeit', 'name']
    if (!allowedFields.includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
    }

    const db: any = supabase

    const { error: updateError } = await db
      .from('raw_material_consumption')
      .update({ 
        [field]: value === '' ? null : value,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('Update API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

