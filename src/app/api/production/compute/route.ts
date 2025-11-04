import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

type InventoryRow = {
  Artikelnummer: string
  Artikelname?: string
  Verfuegbar?: number
  Lagerbestand?: number
}

type ComputeParams = {
  coverageDays: number
  safetyBuffer: number
  holidayLeadTimeDays: number
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function getEasterSunday(year: number) {
  const f = Math.floor
  const G = year % 19
  const C = f(year / 100)
  const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30
  const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11))
  const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7
  const L = I - J
  const month = 3 + f((L + 40) / 44)
  const day = L + 28 - 31 * f(month / 4)
  return new Date(year, month - 1, day)
}

function computeHolidayFactor(now: Date, lead: number) {
  const year = now.getFullYear()
  const easter = getEasterSunday(year)
  const easterStart = new Date(easter); easterStart.setDate(easter.getDate() - lead)
  const easterEnd = new Date(easter); easterEnd.setDate(easter.getDate() + 7)
  const christmasStart = new Date(year, 11, 24 - lead)
  const christmasEnd = new Date(year, 11, 26)
  if ((now >= easterStart && now <= easterEnd) || (now >= christmasStart && now <= christmasEnd)) return 1.15
  return 1.0
}

// Simple in-memory rate limiter (per-process). Suitable for single-user/single-company.
const rateLimitMap: Map<string, { tokens: number; lastRefillMs: number }> = new Map()
const RATE_LIMIT_TOKENS = 10 // requests
const RATE_LIMIT_WINDOW_MS = 60_000 // per minute

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  return first || (req as any).ip || 'unknown'
}

function takeToken(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key) || { tokens: RATE_LIMIT_TOKENS, lastRefillMs: now }
  // Refill
  const elapsed = now - entry.lastRefillMs
  if (elapsed >= RATE_LIMIT_WINDOW_MS) {
    entry.tokens = RATE_LIMIT_TOKENS
    entry.lastRefillMs = now
  }
  if (entry.tokens <= 0) {
    rateLimitMap.set(key, entry)
    return false
  }
  entry.tokens -= 1
  rateLimitMap.set(key, entry)
  return true
}

const InventoryRowSchema = z.object({
  Artikelnummer: z.string().min(1).max(128),
  Artikelname: z.string().max(512).optional(),
  Verfuegbar: z.number().finite().nonnegative().optional(),
  Lagerbestand: z.number().finite().nonnegative().optional(),
})

const ComputeParamsSchema = z.object({
  coverageDays: z.number().int().min(1).max(365),
  safetyBuffer: z.number().int().min(1).max(60),
  holidayLeadTimeDays: z.number().int().min(0).max(60),
})

const RequestBodySchema = z.object({
  inventory: z.array(InventoryRowSchema).min(1).max(5000),
  params: ComputeParamsSchema,
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit per IP
    const ip = getClientIp(req)
    if (!takeToken(ip)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Auth check (server-side): require signed-in user via cookies or Bearer token
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
          // Reassign supabase DB client to use the token-bound client for RLS
          // @ts-ignore – minimal typing bridge between helpers client and direct client
          supabase = headerClient
        }
      }
    }
    if (!authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate input
    let parsed
    try {
      const json = await req.json()
      parsed = RequestBodySchema.parse(json)
    } catch (_e) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const { inventory, params } = parsed
    const now = new Date()
    const lastYear = now.getFullYear() - 1
    const currentMonthIndex = now.getMonth()
    const currentMonthDays = daysInMonth(now.getFullYear(), currentMonthIndex)
    const daysRef = daysInMonth(lastYear, currentMonthIndex)
    const holidayFactor = computeHolidayFactor(now, params.holidayLeadTimeDays)

    // Use the same authed supabase client for DB access
    const db: any = supabase

    // Load sales for last year
    const { data: sales, error: salesErr } = await db
      .from('sales_history')
      .select('*')
      .eq('year', lastYear)
    if (salesErr) throw salesErr

    // Load min stock
    const { data: mins, error: minErr } = await db
      .from('min_stock')
      .select('*')
    if (minErr) throw minErr

    // Load bag sizes
    const { data: bagSizes, error: bagErr } = await db
      .from('product_bag_size')
      .select('*')
    if (bagErr) throw bagErr

    const salesByArt = new Map<string, any>()
    for (const s of sales || []) salesByArt.set(String(s.artikelnummer), s)
    const minByArt = new Map<string, number>()
    for (const m of mins || []) minByArt.set(String(m.artikelnummer), Number(m.global_min_stock) || 0)

    const monthKeys = ['jan','feb','mär','apr','mai','jun','jul','aug','sep','okt','nov','dez']
    const monthKey = monthKeys[currentMonthIndex]

    const items: any[] = []
    const bagByArt = new Map<string, string>()
    for (const b of bagSizes || []) {
      const key = String(b.artikelnummer || '').trim()
      const val = String(b.bag_size || '').trim()
      if (key) bagByArt.set(key, val)
    }
    for (const row of inventory || []) {
      const artikelnummer = String(row.Artikelnummer || '').trim()
      if (!artikelnummer) continue
      const name = row.Artikelname || ''
      const currentStock = Number(row.Verfuegbar ?? row.Lagerbestand ?? 0) || 0
      const s = salesByArt.get(artikelnummer)
      const refMonth = s ? Number(s[monthKey]) || 0 : 0
      // monthly daily usage
      const monthlyDailyUsage = daysRef > 0 ? refMonth / daysRef : 0
      // annual avg from available months with simple outlier capping and recent-month weighting
      let values: number[] = []
      if (s) {
        for (const k of monthKeys) {
          const v = Number(s[k])
          if (!isNaN(v) && v > 0) values.push(v)
        }
      }
      const cnt = values.length
      // Outlier clamp to P10..P90
      const clampValues = (arr: number[]): number[] => {
        if (arr.length === 0) return arr
        const sorted = [...arr].sort((a,b)=>a-b)
        const q = (p: number) => {
          const idx = (sorted.length - 1) * p
          const lo = Math.floor(idx), hi = Math.ceil(idx)
          if (lo === hi) return sorted[lo]
          return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
        }
        const p10 = q(0.10), p90 = q(0.90)
        return arr.map(v => Math.min(p90, Math.max(p10, v)))
      }
      const clamped = clampValues(values)
      // Exponential-like recent weight: last 3 months x2 if present
      let weightedSum = 0, weightTot = 0
      for (let i = 0; i < clamped.length; i++) {
        const v = clamped[i]
        // approximate recency using position from end of monthKeys
        // map values in chronological order matching monthKeys
      }
      // rebuild in chronological order based on monthKeys
      const chronological: number[] = []
      if (s) {
        for (const k of monthKeys) {
          const v = Number(s[k])
          if (!isNaN(v) && v > 0) chronological.push(v)
        }
      }
      const clampedChrono = clampValues(chronological)
      for (let i = 0; i < clampedChrono.length; i++) {
        const v = clampedChrono[i]
        const isRecent = i >= clampedChrono.length - 3
        const w = isRecent ? 2 : 1
        weightedSum += v * w
        weightTot += w
      }
      const monthlyAvg = cnt > 0 && weightTot > 0 ? weightedSum / weightTot : 0
      const annualDailyUsage = (monthlyAvg * 12) / 365
      const usedFallback = cnt === 0
      let finalDailyUsage = !usedFallback ? (0.7 * monthlyDailyUsage + 0.3 * annualDailyUsage) : 0.1
      if (finalDailyUsage <= 0) finalDailyUsage = 0.1

      const daysUntilStockout = finalDailyUsage > 0 ? currentStock / finalDailyUsage : Infinity
      const finalMonthlyUsage = finalDailyUsage * currentMonthDays
      const minStock = minByArt.get(artikelnummer) ?? 0
      const mustProduce = (currentStock < minStock) || (daysUntilStockout < params.safetyBuffer)
      const desiredStock = Math.max(finalDailyUsage * params.coverageDays, minStock) * holidayFactor
      const amountToProduce = (mustProduce && desiredStock > currentStock) ? Math.ceil(desiredStock - currentStock) : 0

      const highThreshold = params.safetyBuffer
      const mediumThreshold = highThreshold * 2
      let priority: 'Hoch' | 'Mittel' | 'Tief' = 'Tief'
      if (daysUntilStockout < highThreshold) priority = 'Hoch'
      else if (daysUntilStockout < mediumThreshold) priority = 'Mittel'

      const bag_size = bagByArt.get(artikelnummer) || null
      items.push({ artikelnummer, name, bag_size, current_stock: currentStock, final_daily_usage: finalDailyUsage, final_monthly_usage: finalMonthlyUsage, current_month_days: currentMonthDays, days_until_stockout: daysUntilStockout, desired_stock: desiredStock, amount_to_produce: amountToProduce, priority, used_fallback: usedFallback, to_produce: mustProduce })
    }

    // Persist run and items (assumes schema exists)
    const { data: run, error: runErr } = await db
      .from('production_plan_runs')
      .insert({ coverage_days: params.coverageDays, safety_buffer: params.safetyBuffer, production_time: 0, holiday_lead_time_days: params.holidayLeadTimeDays, holiday_factor: holidayFactor, sales_year: lastYear })
      .select('*')
      .single()
    if (runErr) throw runErr

    const rows = items.map(i => ({
      run_id: run.id,
      artikelnummer: i.artikelnummer,
      name: i.name,
      bag_size: i.bag_size,
      current_stock: i.current_stock,
      final_daily_usage: i.final_daily_usage,
      final_monthly_usage: i.final_monthly_usage,
      days_until_stockout: i.days_until_stockout,
      desired_stock: i.desired_stock,
      amount_to_produce: i.amount_to_produce,
      priority: i.priority,
      to_produce: i.to_produce,
    }))
    if (rows.length > 0) {
      let { error: insErr } = await db.from('production_plan_items').insert(rows)
      if (insErr && String(insErr.message || '').toLowerCase().includes('final_monthly_usage')) {
        const rowsWithoutMonthly = rows.map((r: any) => {
          const { final_monthly_usage, ...rest } = r
          return rest
        })
        const retry = await db.from('production_plan_items').insert(rowsWithoutMonthly)
        insErr = retry.error || null
      }
      if (insErr) throw insErr
    }

    return NextResponse.json({ run, items })
  } catch (e: any) {
    console.error('Compute API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



