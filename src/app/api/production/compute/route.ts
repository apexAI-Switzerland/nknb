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
  MHD_Lieferant?: string | null
  Abweichung?: number | null
  Lot?: string | null
  MHD?: string | null
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
  MHD_Lieferant: z.string().nullable().optional(),
  Abweichung: z.number().int().nullable().optional(),
  Lot: z.string().nullable().optional(),
  MHD: z.string().nullable().optional(),
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

const DEFAULT_MONTHLY_BURN = 30
const DEFAULT_DAILY_USAGE = DEFAULT_MONTHLY_BURN / 30.44

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

    // Load product infos (consolidated: mindestbestand + beutelgroesse)
    const { data: productInfos, error: infoErr } = await db
      .from('product_infos')
      .select('*')
    if (infoErr) throw infoErr

    const salesByArt = new Map<string, any>()
    for (const s of sales || []) salesByArt.set(String(s.artikelnummer), s)
    const minByArt = new Map<string, number>()
    const bagByArt = new Map<string, string>()
    for (const info of productInfos || []) {
      const key = String(info.artikelnummer || '').trim()
      if (key) {
        minByArt.set(key, Number(info.mindestbestand) || 0)
        const bag = String(info.beutelgroesse || '').trim()
        if (bag) bagByArt.set(key, bag)
      }
    }

    const monthKeys = ['jan','feb','mär','apr','mai','jun','jul','aug','sep','okt','nov','dez']
    const monthKey = monthKeys[currentMonthIndex]

    // Helper: Get months relative to current month for proper weighting
    const getRecentMonthIndices = (currentIdx: number, count: number): number[] => {
      const indices: number[] = []
      for (let i = 0; i < count; i++) {
        // Go backwards from current month (wrapping around year)
        indices.push((currentIdx - i + 12) % 12)
      }
      return indices
    }
    const recentMonthIndices = new Set(getRecentMonthIndices(currentMonthIndex, 3))

    // Helper: Soft outlier clamp using IQR method (less aggressive than P10-P90 for small datasets)
    const clampValuesIQR = (arr: number[]): number[] => {
      if (arr.length < 4) return arr // Not enough data for IQR
      const sorted = [...arr].sort((a,b)=>a-b)
      const q1Idx = Math.floor(sorted.length * 0.25)
      const q3Idx = Math.floor(sorted.length * 0.75)
      const q1 = sorted[q1Idx]
      const q3 = sorted[q3Idx]
      const iqr = q3 - q1
      // Use 1.5*IQR rule but with soft clamping (less aggressive)
      const lower = q1 - 1.5 * iqr
      const upper = q3 + 1.5 * iqr
      return arr.map(v => Math.min(upper, Math.max(lower, v)))
    }

    // Helper: Calculate simple linear trend coefficient using actual month indices
    const calculateTrend = (dataPoints: { monthIdx: number, value: number }[]): number => {
      if (dataPoints.length < 3) return 0
      const n = dataPoints.length
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
      for (const point of dataPoints) {
        const x = point.monthIdx // Use actual month index, not array position
        const y = point.value
        sumX += x
        sumY += y
        sumXY += x * y
        sumX2 += x * x
      }
      const denom = n * sumX2 - sumX * sumX
      if (denom === 0) return 0
      const slope = (n * sumXY - sumX * sumY) / denom
      // Normalize slope by average to get percentage change per month
      const avg = sumY / n
      return avg > 0 ? slope / avg : 0
    }

    const items: any[] = []
    for (const row of inventory || []) {
      const artikelnummer = String(row.Artikelnummer || '').trim()
      if (!artikelnummer) continue
      const name = row.Artikelname || ''
      const currentStock = Number(row.Verfuegbar ?? row.Lagerbestand ?? 0) || 0
      const s = salesByArt.get(artikelnummer)
      const refMonth = s ? Number(s[monthKey]) || 0 : 0
      // monthly daily usage
      const monthlyDailyUsage = daysRef > 0 ? refMonth / daysRef : 0
      
      // Build chronological data with month indices preserved
      const monthlyData: { monthIdx: number, value: number }[] = []
      if (s) {
        for (let i = 0; i < monthKeys.length; i++) {
          const k = monthKeys[i]
          const v = s[k]
          if (v !== null && v !== undefined && !isNaN(Number(v)) && Number(v) > 0) {
            monthlyData.push({ monthIdx: i, value: Number(v) })
          }
        }
      }
      
      const cnt = monthlyData.length
      const usedFallback = cnt === 0
      
      let finalDailyUsage: number
      if (usedFallback) {
        // Improved fallback: use minimum stock / coverage days if available, otherwise small value
        const minStock = minByArt.get(artikelnummer) ?? 0
        finalDailyUsage = minStock > 0 ? minStock / params.coverageDays : DEFAULT_DAILY_USAGE
      } else {
        // Apply IQR-based outlier handling (less aggressive than P10-P90)
        const values = monthlyData.map(d => d.value)
        const clampedValues = clampValuesIQR(values)
        
        // Calculate weighted average with proper recent-month weighting
        let weightedSum = 0, weightTot = 0
        for (let i = 0; i < monthlyData.length; i++) {
          const v = clampedValues[i]
          const monthIdx = monthlyData[i].monthIdx
          // Weight recent months (relative to current month) more heavily
          const isRecent = recentMonthIndices.has(monthIdx)
          const w = isRecent ? 2.0 : 1.0
          weightedSum += v * w
          weightTot += w
        }
        const weightedMonthlyAvg = weightTot > 0 ? weightedSum / weightTot : 0
        
        // Calculate trend adjustment (cap at ±20% to avoid extreme predictions)
        const trendCoeff = calculateTrend(monthlyData)
        const trendAdjustment = Math.max(-0.20, Math.min(0.20, trendCoeff * 3)) // 3 months projection
        
        // Convert to daily usage
        const avgDaysPerMonth = 30.44
        const annualDailyUsage = weightedMonthlyAvg / avgDaysPerMonth
        
        // Combine: 70% current month, 30% weighted average, apply trend
        const baseDailyUsage = refMonth > 0 
          ? (0.7 * monthlyDailyUsage + 0.3 * annualDailyUsage)
          : annualDailyUsage
        
        // Apply trend adjustment (positive trend = increase forecast, negative = decrease)
        finalDailyUsage = baseDailyUsage * (1 + trendAdjustment)
      }
      
      // Ensure minimum positive value
      if (finalDailyUsage <= 0) finalDailyUsage = DEFAULT_DAILY_USAGE

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
      
      // Extract MHD, Lot, and related fields from inventory row
      const mhdLieferant = row.MHD_Lieferant || null
      const abweichung = row.Abweichung !== null && row.Abweichung !== undefined ? Number(row.Abweichung) : null
      const lot = row.Lot || null
      const mhd = row.MHD || null
      
      items.push({ 
        artikelnummer, 
        name, 
        bag_size, 
        current_stock: currentStock, 
        final_daily_usage: finalDailyUsage, 
        final_monthly_usage: finalMonthlyUsage, 
        current_month_days: currentMonthDays, 
        days_until_stockout: daysUntilStockout, 
        desired_stock: desiredStock, 
        amount_to_produce: amountToProduce, 
        priority, 
        used_fallback: usedFallback, 
        to_produce: mustProduce,
        mhd_lieferant: mhdLieferant,
        abweichung: abweichung,
        lot: lot,
        mhd: mhd
      })
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
      mhd_lieferant: i.mhd_lieferant,
      abweichung: i.abweichung,
      lot: i.lot,
      mhd: i.mhd,
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



