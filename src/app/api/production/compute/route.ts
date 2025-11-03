import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

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

export async function POST(req: NextRequest) {
  try {
    const { inventory, params }: { inventory: InventoryRow[]; params: ComputeParams } = await req.json()
    const now = new Date()
    const lastYear = now.getFullYear() - 1
    const currentMonthIndex = now.getMonth()
    const daysRef = daysInMonth(lastYear, currentMonthIndex)
    const holidayFactor = computeHolidayFactor(now, params.holidayLeadTimeDays)

    const supabase = createServerClient()

    // Load sales for last year
    const { data: sales, error: salesErr } = await supabase
      .from('sales_history')
      .select('*')
      .eq('year', lastYear)
    if (salesErr) throw salesErr

    // Load min stock
    const { data: mins, error: minErr } = await supabase
      .from('min_stock')
      .select('*')
    if (minErr) throw minErr

    // Load bag sizes
    const { data: bagSizes, error: bagErr } = await supabase
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
      items.push({ artikelnummer, name, bag_size, current_stock: currentStock, final_daily_usage: finalDailyUsage, days_until_stockout: daysUntilStockout, desired_stock: desiredStock, amount_to_produce: amountToProduce, priority, used_fallback: usedFallback, to_produce: mustProduce })
    }

    // Persist run and items (assumes schema exists)
    const { data: run, error: runErr } = await supabase
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
      days_until_stockout: i.days_until_stockout,
      desired_stock: i.desired_stock,
      amount_to_produce: i.amount_to_produce,
      priority: i.priority,
      to_produce: i.to_produce,
    }))
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('production_plan_items').insert(rows)
      if (insErr) throw insErr
    }

    return NextResponse.json({ run, items })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 })
  }
}



