import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'

type InventoryRow = {
  sku: string
  name?: string
  lagerbestand: number
}

type ConsumptionData = {
  sku: string
  name: string | null
  jan: number | null
  feb: number | null
  mrz: number | null
  apr: number | null
  mai: number | null
  jun: number | null
  jul: number | null
  aug: number | null
  sep: number | null
  okt: number | null
  nov: number | null
  dez: number | null
  herkunft: string | null
  lieferant: string | null
  zwischenhaendler: string | null
  lieferzeit: string | null
}

// Helper: IQR-based outlier handling
function clampValuesIQR(arr: number[]): number[] {
  if (arr.length < 4) return arr
  const sorted = [...arr].sort((a, b) => a - b)
  const q1Idx = Math.floor(sorted.length * 0.25)
  const q3Idx = Math.floor(sorted.length * 0.75)
  const q1 = sorted[q1Idx]
  const q3 = sorted[q3Idx]
  const iqr = q3 - q1
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  return arr.map(v => Math.min(upper, Math.max(lower, v)))
}

// Helper: Calculate linear trend coefficient using actual month indices
function calculateTrend(dataPoints: { monthIdx: number, value: number }[]): number {
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
  const avg = sumY / n
  return avg > 0 ? slope / avg : 0
}

// Helper: Get recent months relative to current month
function getRecentMonthIndices(currentIdx: number, count: number): Set<number> {
  const indices = new Set<number>()
  for (let i = 0; i < count; i++) {
    indices.add((currentIdx - i + 12) % 12)
  }
  return indices
}

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
    const { inventory, year } = body as { inventory: InventoryRow[], year?: number }
    
    if (!inventory || !Array.isArray(inventory) || inventory.length === 0) {
      return NextResponse.json({ error: 'No inventory data provided' }, { status: 400 })
    }

    const db: any = supabase
    const targetYear = year || 2025

    // Load consumption data
    const { data: consumptionData, error: consumptionErr } = await db
      .from('raw_material_consumption')
      .select('*')
      .eq('year', targetYear)

    if (consumptionErr) {
      console.error('Consumption fetch error:', consumptionErr)
      return NextResponse.json({ error: 'Failed to load consumption data' }, { status: 500 })
    }

    // Create lookup map
    const consumptionBySku = new Map<string, ConsumptionData>()
    for (const c of (consumptionData || [])) {
      consumptionBySku.set(String(c.sku).trim().toLowerCase(), c)
    }

    const monthKeys = ['jan', 'feb', 'mrz', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez']
    const currentMonthIndex = new Date().getMonth()
    const recentMonthIndices = getRecentMonthIndices(currentMonthIndex, 3)

    const results: any[] = []

    for (const item of inventory) {
      const sku = String(item.sku || '').trim()
      if (!sku) continue

      const skuLower = sku.toLowerCase()
      const consumption = consumptionBySku.get(skuLower)
      const lagerbestand = Number(item.lagerbestand) || 0
      const name = item.name || consumption?.name || ''
      const herkunft = consumption?.herkunft || null
      const lieferant = consumption?.lieferant || null
      const zwischenhaendler = consumption?.zwischenhaendler || null
      const lieferzeitStr = consumption?.lieferzeit || null
      const lieferzeit = lieferzeitStr ? parseFloat(lieferzeitStr) : null

      // Extract monthly values
      const monthlyData: { monthIdx: number, value: number }[] = []
      if (consumption) {
        for (let i = 0; i < monthKeys.length; i++) {
          const k = monthKeys[i] as keyof ConsumptionData
          const v = consumption[k]
          if (v !== null && v !== undefined && !isNaN(Number(v)) && Number(v) > 0) {
            monthlyData.push({ monthIdx: i, value: Number(v) })
          }
        }
      }

      let avgVerbrauchMonat = 0
      let reichweiteMonat = Infinity
      let usedFallback = false
      let trendDirection: 'up' | 'down' | 'stable' = 'stable'

      if (monthlyData.length === 0) {
        // No consumption data available
        usedFallback = true
        avgVerbrauchMonat = 0
        reichweiteMonat = lagerbestand > 0 ? Infinity : 0
      } else {
        const values = monthlyData.map(d => d.value)
        const clampedValues = clampValuesIQR(values)

        // Calculate weighted average (recent months weighted higher)
        let weightedSum = 0
        let weightTot = 0
        for (let i = 0; i < monthlyData.length; i++) {
          const v = clampedValues[i]
          const monthIdx = monthlyData[i].monthIdx
          const isRecent = recentMonthIndices.has(monthIdx)
          const w = isRecent ? 2.0 : 1.0
          weightedSum += v * w
          weightTot += w
        }
        avgVerbrauchMonat = weightTot > 0 ? weightedSum / weightTot : 0

        // Calculate trend using actual month indices
        const trendCoeff = calculateTrend(monthlyData)
        if (trendCoeff > 0.05) {
          trendDirection = 'up'
          // Apply slight increase for rising trends
          avgVerbrauchMonat *= (1 + Math.min(0.15, trendCoeff))
        } else if (trendCoeff < -0.05) {
          trendDirection = 'down'
          // Apply slight decrease for falling trends
          avgVerbrauchMonat *= (1 + Math.max(-0.15, trendCoeff))
        }

        // Calculate Reichweite in months
        if (avgVerbrauchMonat > 0) {
          reichweiteMonat = lagerbestand / avgVerbrauchMonat
        } else {
          reichweiteMonat = lagerbestand > 0 ? Infinity : 0
        }
      }

      // Determine status
      let status: 'green' | 'yellow' | 'orange' | 'red' = 'green'
      let statusText = 'Ausreichend'
      let lieferzeitWarning = false

      if (reichweiteMonat === Infinity) {
        status = 'green'
        statusText = 'Kein Verbrauch / Unendlich'
      } else if (reichweiteMonat < 1) {
        status = 'red'
        statusText = 'Kritisch'
      } else if (reichweiteMonat < 2) {
        status = 'orange'
        statusText = 'Warnung'
      } else if (reichweiteMonat < 3) {
        status = 'yellow'
        statusText = 'Aufmerksamkeit'
      } else {
        status = 'green'
        statusText = 'Ausreichend'
      }

      // Check against Lieferzeit
      if (lieferzeit !== null && !isNaN(lieferzeit) && lieferzeit > 0) {
        if (reichweiteMonat < lieferzeit && reichweiteMonat !== Infinity) {
          lieferzeitWarning = true
          status = 'red'
          statusText = `Reichweite unter Lieferzeit (${lieferzeit} Monate)`
        }
      }

      results.push({
        sku,
        name,
        herkunft,
        lieferant,
        zwischenhaendler,
        lagerbestand,
        avgVerbrauchMonat: Math.round(avgVerbrauchMonat * 100) / 100,
        reichweiteMonat: reichweiteMonat === Infinity ? null : Math.round(reichweiteMonat * 10) / 10,
        lieferzeit: lieferzeit,
        status,
        statusText,
        lieferzeitWarning,
        trendDirection,
        usedFallback
      })
    }

    // Sort by: 
    // 1. Items WITH consumption data (usedFallback = false) first
    // 2. Then by status (red, orange, yellow, green)
    // 3. Within each status: by reichweite ascending (lowest first)
    // 4. Items WITHOUT consumption data (usedFallback = true) at the bottom
    const statusOrder: Record<string, number> = { 'red': 0, 'orange': 1, 'yellow': 2, 'green': 3 }
    
    results.sort((a, b) => {
      // Items without consumption data go to bottom
      const aHasConsumptionData = !a.usedFallback
      const bHasConsumptionData = !b.usedFallback
      
      if (aHasConsumptionData && !bHasConsumptionData) return -1
      if (!aHasConsumptionData && bHasConsumptionData) return 1
      
      // Sort by status
      const statusDiff = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4)
      if (statusDiff !== 0) return statusDiff
      
      // Within same status: sort by reichweite ascending (lowest first)
      // null/Infinity goes to the end within the status
      const aReichweite = a.reichweiteMonat ?? Infinity
      const bReichweite = b.reichweiteMonat ?? Infinity
      return aReichweite - bReichweite
    })

    return NextResponse.json({ 
      success: true,
      results,
      analyzedAt: new Date().toISOString(),
      year: targetYear
    })
  } catch (e: any) {
    console.error('Analyze API error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

