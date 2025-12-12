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
    const { rows, year } = body
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 })
    }

    const db: any = supabase
    const monthMap: Record<string, string> = {
      'jan': 'jan', 'januar': 'jan',
      'feb': 'feb', 'februar': 'feb',
      'mrz': 'mrz', 'mär': 'mrz', 'maerz': 'mrz', 'märz': 'mrz', 'mar': 'mrz',
      'apr': 'apr', 'april': 'apr',
      'mai': 'mai', 'may': 'mai',
      'jun': 'jun', 'juni': 'jun',
      'jul': 'jul', 'juli': 'jul',
      'aug': 'aug', 'august': 'aug',
      'sep': 'sep', 'sept': 'sep', 'september': 'sep',
      'okt': 'okt', 'oktober': 'okt', 'oct': 'okt',
      'nov': 'nov', 'november': 'nov',
      'dez': 'dez', 'dezember': 'dez', 'dec': 'dez'
    }

    const toUpsert: any[] = []
    
    for (const row of rows) {
      const keys = Object.fromEntries(
        Object.keys(row || {}).map(k => [k.trim().toLowerCase(), k])
      )
      
      const get = (aliases: string[]) => {
        for (const a of aliases) {
          const k = keys[a]
          if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
            return row[k]
          }
        }
        return undefined
      }

      const sku = String(get(['sku', 'artikelnummer', 'artikelnr', 'id']) || '').trim()
      if (!sku) continue

      const name = String(get(['name', 'artikelname', 'produktname', 'bezeichnung']) || '').trim()
      const herkunft = String(get(['herkunft', 'origin', 'ursprung']) || '').trim() || null
      const lieferant = String(get(['lieferant', 'supplier', 'vendor']) || '').trim() || null
      const lieferzeit = String(get(['lieferzeit', 'leadtime', 'lead_time', 'lead time']) || '').trim() || null

      // Parse month values
      const record: any = {
        sku,
        name: name || null,
        year: year || 2025,
        herkunft,
        lieferant,
        lieferzeit,
        updated_at: new Date().toISOString()
      }

      // Map all month columns
      for (const [originalKey, key] of Object.entries(keys)) {
        const normalizedKey = originalKey.toLowerCase().trim()
        const monthKey = monthMap[normalizedKey]
        if (monthKey) {
          const val = row[key]
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            const num = Number(String(val).replace(',', '.').replace(/\s/g, ''))
            record[monthKey] = isNaN(num) ? null : num
          }
        }
      }

      toUpsert.push(record)
    }

    if (toUpsert.length === 0) {
      return NextResponse.json({ error: 'No valid rows found' }, { status: 400 })
    }

    // Delete existing data for the year and SKUs
    const skus = toUpsert.map(r => r.sku)
    await db.from('raw_material_consumption')
      .delete()
      .in('sku', skus)
      .eq('year', year || 2025)

    // Insert new data
    const { error: insertError } = await db
      .from('raw_material_consumption')
      .insert(toUpsert)

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      imported: toUpsert.length,
      message: `${toUpsert.length} Rohstoffe für Jahr ${year || 2025} importiert`
    })
  } catch (e: any) {
    console.error('Import API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

