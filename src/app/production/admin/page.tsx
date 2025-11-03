'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
// @ts-ignore
import * as Papa from 'papaparse'
// @ts-ignore
import * as XLSX from 'xlsx'
import Link from 'next/link'

export default function ProductionAdminPage() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const salesInputRef = useRef<HTMLInputElement | null>(null)
  const minInputRef = useRef<HTMLInputElement | null>(null)
  const bagInputRef = useRef<HTMLInputElement | null>(null)
  const [stats, setStats] = useState<{ salesYearCount?: number, minCount?: number, bagCount?: number, salesYear?: number }>({})
  const [salesSample, setSalesSample] = useState<any[]>([])
  const [minSample, setMinSample] = useState<any[]>([])
  const [bagSample, setBagSample] = useState<any[]>([])

  const parseCSV = (text: string): any[] => {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ',' })
    return parsed.data as any[]
  }
  const parseXLSX = async (file: File): Promise<any[]> => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
  }

  const importSales = async (file: File) => {
    try {
      setBusy(true); setMsg('')
      const rows = file.name.toLowerCase().endsWith('.csv') ? parseCSV(await file.text()) : await parseXLSX(file)
      const headers = Object.keys(rows[0] || {})
      const monthMap: Record<string,string> = { Jan: 'jan', Feb: 'feb', Mär: 'mär', Mar: 'mär', Apr: 'apr', Mai: 'mai', Jun: 'jun', Jul: 'jul', Aug: 'aug', Sep: 'sep', Okt: 'okt', Nov: 'nov', Dez: 'dez', Dec: 'dez' }
      const monthHeaderRegex = /^(Jan|Feb|Mär|Mar|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez|Dec)\s(\d{2})$/
      const mh = headers.filter(h => monthHeaderRegex.test(h))
      if (mh.length === 0) throw new Error('Keine Monats-Spalten gefunden (z.B. "Jan 24")')
      const yy = Number(mh[0].match(monthHeaderRegex)![2])
      const year = 2000 + yy

      const toUpsertSales: any[] = []
      const toUpsertProducts: any[] = []
      for (const r of rows) {
        const artikelnummer = String(r['Artikelnummer'] ?? r['artikelnr'] ?? r['SKU'] ?? '').trim()
        if (!artikelnummer) continue
        const name = String(r['ArtName'] ?? r['Artikelname'] ?? r['Name'] ?? '').trim()
        const rec: any = { artikelnummer, year }
        for (const h of mh) {
          const [, mon] = h.match(monthHeaderRegex) as RegExpMatchArray
          const monKey = monthMap[h.split(' ')[0] as keyof typeof monthMap]
          const val = r[h]
          rec[monKey] = val === '' || val == null ? null : Number(String(val).replace(',','.'))
        }
        toUpsertSales.push(rec)
        toUpsertProducts.push({ artikelnummer, name })
      }

      // Upsert products first
      if (toUpsertProducts.length > 0) {
        // unique by artikelnummer
        const uniqMap = new Map<string, any>()
        for (const p of toUpsertProducts) uniqMap.set(p.artikelnummer, p)
        const uniq = Array.from(uniqMap.values())
        await supabase().from('product_master').upsert(uniq, { onConflict: 'artikelnummer' })
      }
      // Upsert sales by (artikelnummer, year) → emulate with delete+insert for simplicity
      if (toUpsertSales.length > 0) {
        const arts = Array.from(new Set(toUpsertSales.map(r => r.artikelnummer)))
        await supabase().from('sales_history').delete().in('artikelnummer', arts).eq('year', year)
        await supabase().from('sales_history').insert(toUpsertSales)
      }
      setMsg(`Import abgeschlossen: ${toUpsertSales.length} Datensätze für ${year}.`)
      await refreshStats()
    } catch (e: any) {
      setMsg(e?.message || 'Fehler beim Import')
    } finally {
      setBusy(false)
    }
  }

  const importMinStock = async (file: File) => {
    try {
      setBusy(true); setMsg('')
      const rows = file.name.toLowerCase().endsWith('.csv') ? parseCSV(await file.text()) : await parseXLSX(file)
      const toUpsert: any[] = []
      for (const r of rows) {
        const artikelnummer = String(r['Artikelnummer'] ?? r['artikelnr'] ?? '').trim()
        if (!artikelnummer) continue
        const v = r['Globaler Mindestbestand'] ?? r['Mindestbestand'] ?? r['min'] ?? r['Minimum']
        const global_min_stock = v === '' || v == null ? 0 : Number(String(v).replace(',','.'))
        toUpsert.push({ artikelnummer, global_min_stock })
      }
      if (toUpsert.length > 0) {
        await supabase().from('min_stock').upsert(toUpsert, { onConflict: 'artikelnummer' })
      }
      setMsg(`Mindestbestand aktualisiert: ${toUpsert.length} Artikel.`)
      await refreshStats()
    } catch (e: any) {
      setMsg(e?.message || 'Fehler beim Import')
    } finally {
      setBusy(false)
    }
  }

  const refreshStats = async () => {
    const now = new Date(); const lastYear = now.getFullYear() - 1
    const sales = await supabase().from('sales_history').select('*', { count: 'exact', head: true }).eq('year', lastYear)
    const min = await supabase().from('min_stock').select('*', { count: 'exact', head: true })
    const bag = await supabase().from('product_bag_size').select('*', { count: 'exact', head: true })
    if ((bag as any).error) {
      setMsg('Hinweis: Tabelle product_bag_size fehlt oder ist nicht zugreifbar. Bitte SQL ausführen.');
    }
    setStats({ salesYear: lastYear, salesYearCount: sales.count ?? 0, minCount: min.count ?? 0, bagCount: (bag as any).count ?? 0 })

    // Load small previews
    const [salesPrev, minPrev, bagPrev] = await Promise.all([
      supabase().from('sales_history').select('*').eq('year', lastYear).order('artikelnummer', { ascending: true }).limit(10),
      supabase().from('min_stock').select('*').order('artikelnummer', { ascending: true }).limit(10),
      supabase().from('product_bag_size').select('*').order('artikelnummer', { ascending: true }).limit(10),
    ])
    setSalesSample(salesPrev.data || [])
    setMinSample(minPrev.data || [])
    setBagSample(bagPrev.data || [])
  }

  useEffect(() => { refreshStats() }, [])

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold naturkostbar-accent">Produktionsplanung – Administration</h1>
        <Link href="/production">
          <Button variant="outline">Zur Produktionsplanung</Button>
        </Link>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Verkaufszahlen (Vorjahr)</TabsTrigger>
          <TabsTrigger value="min">Mindestbestand</TabsTrigger>
          <TabsTrigger value="bags">Beutelgrössen</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Import – Verkaufszahlen</CardTitle>
              <CardDescription>CSV/XLSX mit Spalten „Artikelnummer“, „ArtName/Artikelname“ und Monats-Spalten „Jan 24“ … „Dez 24“.</CardDescription>
            </CardHeader>
            <CardContent>
              <input ref={salesInputRef} type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => { const f = e.target.files?.[0]; if (f) importSales(f) }} style={{ display: 'none' }} />
              <Button onClick={() => salesInputRef.current?.click()} disabled={busy}>Datei auswählen</Button>
              <div className="text-sm text-gray-600 mt-3">
                {busy ? 'Verarbeite…' : msg || (stats.salesYearCount !== undefined ? `Aktueller Datenstand: ${stats.salesYearCount} Einträge für ${stats.salesYear}.` : '')}
              </div>
            {salesSample.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border rounded bg-white text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1 text-left">Artikel</th>
                      <th className="px-2 py-1 text-right">Jan</th>
                      <th className="px-2 py-1 text-right">Feb</th>
                      <th className="px-2 py-1 text-right">Mär</th>
                      <th className="px-2 py-1 text-right">Apr</th>
                      <th className="px-2 py-1 text-right">Mai</th>
                      <th className="px-2 py-1 text-right">Jun</th>
                      <th className="px-2 py-1 text-right">Jul</th>
                      <th className="px-2 py-1 text-right">Aug</th>
                      <th className="px-2 py-1 text-right">Sep</th>
                      <th className="px-2 py-1 text-right">Okt</th>
                      <th className="px-2 py-1 text-right">Nov</th>
                      <th className="px-2 py-1 text-right">Dez</th>
                    </tr>
                  </thead>
                  <tbody>
                    {salesSample.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-2 py-1">{String(r.artikelnummer)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.jan ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.feb ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r['mär'] ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.apr ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.mai ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.jun ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.jul ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.aug ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.sep ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.okt ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.nov ?? 0)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.dez ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="min" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Import – Mindestbestand</CardTitle>
              <CardDescription>CSV/XLSX mit Spalten „Artikelnummer“, „Globaler Mindestbestand“.</CardDescription>
            </CardHeader>
            <CardContent>
              <input ref={minInputRef} type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => { const f = e.target.files?.[0]; if (f) importMinStock(f) }} style={{ display: 'none' }} />
              <Button onClick={() => minInputRef.current?.click()} disabled={busy}>Datei auswählen</Button>
              <div className="text-sm text-gray-600 mt-3">{busy ? 'Verarbeite…' : msg || (stats.minCount !== undefined ? `Aktueller Datenstand: ${stats.minCount} Artikel mit Mindestbestand.` : '')}</div>
            {minSample.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border rounded bg-white text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1 text-left">Artikel</th>
                      <th className="px-2 py-1 text-right">Mindestbestand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {minSample.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-2 py-1">{String(r.artikelnummer)}</td>
                        <td className="px-2 py-1 text-right">{Number(r.global_min_stock ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bags" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Import – Beutelgrössen</CardTitle>
              <CardDescription>CSV/XLSX mit Spalten „Artikelnummer“, „Beutelgröße“ (S/M/L).</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={bagInputRef}
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    setBusy(true); setMsg('')
                    const rows = f.name.toLowerCase().endsWith('.csv') ? parseCSV(await f.text()) : await parseXLSX(f)
                    const toUpsert: any[] = []
                    const toUpsertProducts: any[] = []
                    for (const r of rows) {
                      const artikelnummer = String(r['Artikelnummer'] ?? r['artikelnr'] ?? r['SKU'] ?? '').trim()
                      if (!artikelnummer) continue
                      const b = String(r['Beutelgröße'] ?? r['Beutelgrösse'] ?? r['Beutelgroesse'] ?? r['bag'] ?? '').trim().toUpperCase()
                      if (!['S','M','L'].includes(b)) continue
                      toUpsert.push({ artikelnummer, bag_size: b })
                      const name = String(r['ArtName'] ?? r['Artikelname'] ?? r['Name'] ?? '').trim() || null
                      toUpsertProducts.push({ artikelnummer, name })
                    }
                    if (toUpsert.length > 0) {
                      // Ensure product exists to satisfy FK
                      if (toUpsertProducts.length > 0) {
                        // dedupe by artikelnummer
                        const map = new Map<string, any>()
                        for (const p of toUpsertProducts) if (p.artikelnummer) map.set(p.artikelnummer, p)
                        const uniq = Array.from(map.values())
                        const { error: prodErr } = await supabase().from('product_master').upsert(uniq, { onConflict: 'artikelnummer' })
                        if (prodErr) { setMsg(`Fehler beim Anlegen im Produktstamm: ${prodErr.message}`); console.error(prodErr); return }
                      }
                      const { error, count } = await supabase().from('product_bag_size').upsert(toUpsert, { onConflict: 'artikelnummer', count: 'exact' })
                      if (error) { setMsg(`Fehler beim Speichern: ${error.message}`); console.error(error); return }
                      setMsg(`Beutelgrössen aktualisiert: ${count ?? toUpsert.length} Artikel.`)
                    } else {
                      setMsg('Keine gültigen Zeilen gefunden (Artikelnummer/Beutelgröße).')
                    }
                    await refreshStats()
                  } catch (e: any) {
                    setMsg(e?.message || 'Fehler beim Import')
                  } finally {
                    setBusy(false)
                  }
                }}
                style={{ display: 'none' }}
              />
              <Button onClick={() => bagInputRef.current?.click()} disabled={busy}>Datei auswählen</Button>
              <div className="text-sm text-gray-600 mt-3">{busy ? 'Verarbeite…' : msg || (stats.bagCount !== undefined ? `Aktueller Datenstand: ${stats.bagCount} Artikel mit Beutelgröße.` : '')}</div>
              {bagSample.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border rounded bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-1 text-left">Artikel</th>
                        <th className="px-2 py-1 text-left">Beutelgröße</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bagSample.map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-2 py-1">{String(r.artikelnummer)}</td>
                          <td className="px-2 py-1">{String(r.bag_size || '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}


