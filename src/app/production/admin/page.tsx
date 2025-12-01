'use client'
import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
// @ts-ignore
import * as Papa from 'papaparse'
// @ts-ignore
import * as XLSX from 'xlsx'
import Link from 'next/link'

type ProductInfo = {
  id: string
  artikelnummer: string
  artikelname: string | null
  mindestbestand: number
  beutelgroesse: 'S' | 'M' | 'L' | null
}

type SalesHistory = {
  id: string
  artikelnummer: string
  year: number
  jan: number | null
  feb: number | null
  mär: number | null
  apr: number | null
  mai: number | null
  jun: number | null
  jul: number | null
  aug: number | null
  sep: number | null
  okt: number | null
  nov: number | null
  dez: number | null
}

export default function ProductionAdminPage() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')
  const salesInputRef = useRef<HTMLInputElement | null>(null)
  const productInfoInputRef = useRef<HTMLInputElement | null>(null)
  const [stats, setStats] = useState<{ salesYearCount?: number, productInfoCount?: number, salesYear?: number }>({})
  const [productInfos, setProductInfos] = useState<ProductInfo[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [salesHistory, setSalesHistory] = useState<SalesHistory[]>([])
  const [savingSalesId, setSavingSalesId] = useState<string | null>(null)
  const [newSalesProduct, setNewSalesProduct] = useState<{ artikelnummer: string, name: string } | null>(null)

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

      if (toUpsertProducts.length > 0) {
        const uniqMap = new Map<string, any>()
        for (const p of toUpsertProducts) uniqMap.set(p.artikelnummer, p)
        const uniq = Array.from(uniqMap.values())
        await supabase().from('product_master').upsert(uniq, { onConflict: 'artikelnummer' })
      }
      if (toUpsertSales.length > 0) {
        const arts = Array.from(new Set(toUpsertSales.map(r => r.artikelnummer)))
        await supabase().from('sales_history').delete().in('artikelnummer', arts).eq('year', year)
        await supabase().from('sales_history').insert(toUpsertSales)
      }
      setMsg(`Import abgeschlossen: ${toUpsertSales.length} Datensätze für ${year}.`)
      await refreshStats()
      await loadSalesHistory()
    } catch (e: any) {
      setMsg(e?.message || 'Fehler beim Import')
    } finally {
      setBusy(false)
    }
  }

  const importProductInfos = async (file: File) => {
    try {
      setBusy(true); setMsg('')
      const rows = file.name.toLowerCase().endsWith('.csv') ? parseCSV(await file.text()) : await parseXLSX(file)
      const toUpsert: any[] = []
      const toUpsertProducts: any[] = []
      for (const r of rows) {
        const artikelnummer = String(r['Artikelnummer'] ?? r['artikelnr'] ?? r['SKU'] ?? '').trim()
        if (!artikelnummer) continue
        const artikelname = String(r['Artikelname'] ?? r['ArtName'] ?? r['Name'] ?? '').trim() || null
        const mindestbestand = r['Mindestbestand'] ?? r['Globaler Mindestbestand'] ?? r['min'] ?? r['Minimum'] ?? 0
        const beutelgroesse = String(r['Beutelgröße'] ?? r['Beutelgrösse'] ?? r['Beutelgroesse'] ?? r['bag'] ?? '').trim().toUpperCase()
        const bag = ['S','M','L'].includes(beutelgroesse) ? beutelgroesse : null
        toUpsert.push({ artikelnummer, artikelname, mindestbestand: Number(String(mindestbestand).replace(',','.')) || 0, beutelgroesse: bag })
        toUpsertProducts.push({ artikelnummer, name: artikelname })
      }
      if (toUpsertProducts.length > 0) {
        const map = new Map<string, any>()
        for (const p of toUpsertProducts) if (p.artikelnummer) map.set(p.artikelnummer, p)
        const uniq = Array.from(map.values())
        await supabase().from('product_master').upsert(uniq, { onConflict: 'artikelnummer' })
      }
      if (toUpsert.length > 0) {
        const { error, count } = await supabase().from('product_infos').upsert(toUpsert, { onConflict: 'artikelnummer', count: 'exact' })
        if (error) { setMsg(`Fehler beim Speichern: ${error.message}`); console.error(error); return }
        setMsg(`Produktinfos aktualisiert: ${count ?? toUpsert.length} Artikel.`)
      } else {
        setMsg('Keine gültigen Zeilen gefunden.')
      }
      await refreshStats()
      await loadProductInfos()
    } catch (e: any) {
      setMsg(e?.message || 'Fehler beim Import')
    } finally {
      setBusy(false)
    }
  }

  const loadProductInfos = async () => {
    const { data, error } = await supabase().from('product_infos').select('*').order('artikelnummer', { ascending: true })
    if (error) {
      console.error(error)
      setProductInfos([])
    } else {
      setProductInfos((data || []) as ProductInfo[])
    }
  }

  const saveField = async (id: string, field: keyof ProductInfo, value: any) => {
    try {
      setSavingId(id)
      const update: any = { [field]: value }
      const { error, data } = await supabase().from('product_infos').update(update).eq('id', id).select()
      if (error) {
        console.error('Save error:', error)
        throw error
      }
      // Update local state immediately for better UX
      setProductInfos(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item))
      setMsg('Gespeichert')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) {
      console.error('Save field error:', e)
      setMsg(`Fehler beim Speichern: ${e?.message || 'Unbekannter Fehler'}`)
      // Reload on error to restore original value
      await loadProductInfos()
    } finally {
      setSavingId(null)
    }
  }

  const loadSalesHistory = async () => {
    const now = new Date()
    const lastYear = now.getFullYear() - 1
    const { data, error } = await supabase()
      .from('sales_history')
      .select('*')
      .eq('year', lastYear)
      .order('artikelnummer', { ascending: true })
    if (error) {
      console.error(error)
      setSalesHistory([])
    } else {
      setSalesHistory((data || []) as SalesHistory[])
    }
  }

  const saveSalesField = async (id: string, field: keyof SalesHistory, value: any) => {
    try {
      setSavingSalesId(id)
      const update: any = { [field]: value === '' ? null : (field === 'year' ? Number(value) : (value === '' || value === null ? null : Number(value))) }
      const { error } = await supabase().from('sales_history').update(update).eq('id', id)
      if (error) {
        console.error('Save error:', error)
        throw error
      }
      // Update local state immediately
      setSalesHistory(prev => prev.map(item => item.id === id ? { ...item, [field]: update[field] } : item))
      setMsg('Gespeichert')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) {
      console.error('Save sales field error:', e)
      setMsg(`Fehler beim Speichern: ${e?.message || 'Unbekannter Fehler'}`)
      await loadSalesHistory()
    } finally {
      setSavingSalesId(null)
    }
  }

  const addNewSalesProduct = async () => {
    if (!newSalesProduct || !newSalesProduct.artikelnummer.trim()) {
      setMsg('Bitte Artikelnummer eingeben')
      return
    }
    try {
      setBusy(true)
      const now = new Date()
      const lastYear = now.getFullYear() - 1
      
      // Add to product_master
      await supabase().from('product_master').upsert({ 
        artikelnummer: newSalesProduct.artikelnummer.trim(), 
        name: newSalesProduct.name.trim() || null 
      }, { onConflict: 'artikelnummer' })
      
      // Create sales history entry
      const { error } = await supabase().from('sales_history').insert({
        artikelnummer: newSalesProduct.artikelnummer.trim(),
        year: lastYear,
        jan: null, feb: null, mär: null, apr: null, mai: null, jun: null,
        jul: null, aug: null, sep: null, okt: null, nov: null, dez: null
      })
      
      if (error) throw error
      
      setNewSalesProduct(null)
      await loadSalesHistory()
      await refreshStats()
      setMsg('Produkt hinzugefügt')
      setTimeout(() => setMsg(''), 2000)
    } catch (e: any) {
      setMsg(`Fehler: ${e?.message || 'Unbekannter Fehler'}`)
    } finally {
      setBusy(false)
    }
  }

  const refreshStats = async () => {
    const now = new Date(); const lastYear = now.getFullYear() - 1
    const sales = await supabase().from('sales_history').select('*', { count: 'exact', head: true }).eq('year', lastYear)
    const infos = await supabase().from('product_infos').select('*', { count: 'exact', head: true })
    setStats({ salesYear: lastYear, salesYearCount: sales.count ?? 0, productInfoCount: infos.count ?? 0 })
  }

  useEffect(() => {
    refreshStats()
    loadProductInfos()
    loadSalesHistory()
  }, [])

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
          <TabsTrigger value="productinfos">Produktinfos</TabsTrigger>
        </TabsList>
        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Import – Verkaufszahlen</CardTitle>
              <CardDescription>CSV/XLSX mit Spalten „Artikelnummer", „ArtName/Artikelname" und Monats-Spalten „Jan 24" … „Dez 24".</CardDescription>
            </CardHeader>
            <CardContent>
              <input ref={salesInputRef} type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => { const f = e.target.files?.[0]; if (f) importSales(f) }} style={{ display: 'none' }} />
              <Button onClick={() => salesInputRef.current?.click()} disabled={busy}>Datei auswählen</Button>
              <div className="text-sm text-gray-600 mt-3">
                {busy ? 'Verarbeite…' : msg || (stats.salesYearCount !== undefined ? `Aktueller Datenstand: ${stats.salesYearCount} Einträge für ${stats.salesYear}.` : '')}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Verkaufszahlen bearbeiten</CardTitle>
              <CardDescription>Bearbeiten Sie die Verkaufsdaten für {stats.salesYear || new Date().getFullYear() - 1} oder fügen Sie neue Produkte hinzu.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Add new product */}
              <div className="mb-4 p-3 bg-gray-50 rounded border">
                <div className="flex items-center gap-2 mb-2">
                  <Input
                    placeholder="Artikelnummer"
                    value={newSalesProduct?.artikelnummer || ''}
                    onChange={(e) => setNewSalesProduct(prev => ({ ...prev, artikelnummer: e.target.value, name: prev?.name || '' }))}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Artikelname (optional)"
                    value={newSalesProduct?.name || ''}
                    onChange={(e) => setNewSalesProduct(prev => ({ ...prev, name: e.target.value, artikelnummer: prev?.artikelnummer || '' }))}
                    className="flex-1"
                  />
                  <Button onClick={addNewSalesProduct} disabled={busy || !newSalesProduct?.artikelnummer?.trim()}>Hinzufügen</Button>
                </div>
              </div>

              {salesHistory.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full border rounded bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left">Artikelnummer</th>
                        <th className="px-3 py-2 text-left">Jan</th>
                        <th className="px-3 py-2 text-left">Feb</th>
                        <th className="px-3 py-2 text-left">Mär</th>
                        <th className="px-3 py-2 text-left">Apr</th>
                        <th className="px-3 py-2 text-left">Mai</th>
                        <th className="px-3 py-2 text-left">Jun</th>
                        <th className="px-3 py-2 text-left">Jul</th>
                        <th className="px-3 py-2 text-left">Aug</th>
                        <th className="px-3 py-2 text-left">Sep</th>
                        <th className="px-3 py-2 text-left">Okt</th>
                        <th className="px-3 py-2 text-left">Nov</th>
                        <th className="px-3 py-2 text-left">Dez</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesHistory.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="px-3 py-2 font-medium">{item.artikelnummer}</td>
                          {(['jan', 'feb', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'] as const).map((month) => (
                            <td key={month} className="px-2 py-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={item[month] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value)
                                  setSalesHistory(prev => prev.map(i => i.id === item.id ? { ...i, [month]: val } : i))
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value === '' ? null : Number(e.target.value)
                                  saveSalesField(item.id, month, val)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur()
                                  }
                                }}
                                className="h-8 w-20 text-right text-sm"
                                disabled={savingSalesId === item.id}
                                placeholder="—"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productinfos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Produktinfos</CardTitle>
              <CardDescription>CSV/XLSX mit Spalten „Artikelnummer", „Artikelname", „Mindestbestand", „Beutelgröße" (S/M/L).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <input ref={productInfoInputRef} type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange={(e) => { const f = e.target.files?.[0]; if (f) importProductInfos(f) }} style={{ display: 'none' }} />
                <Button onClick={() => productInfoInputRef.current?.click()} disabled={busy}>CSV/XLSX importieren</Button>
                <div className="text-sm text-gray-600 mt-2">
                  {busy ? 'Verarbeite…' : msg || (stats.productInfoCount !== undefined ? `Aktueller Datenstand: ${stats.productInfoCount} Artikel.` : '')}
                </div>
              </div>

              {productInfos.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border rounded bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left">Artikelnummer</th>
                        <th className="px-3 py-2 text-left">Artikelname</th>
                        <th className="px-3 py-2 text-right">Mindestbestand</th>
                        <th className="px-3 py-2 text-left">Beutelgröße</th>
                        <th className="px-3 py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productInfos.map((item) => (
                        <tr key={item.id} className="border-b">
                          <td className="px-3 py-2">{item.artikelnummer}</td>
                          <td className="px-3 py-2">
                            <Input
                              value={item.artikelname || ''}
                              onChange={(e) => {
                                setProductInfos(prev => prev.map(i => i.id === item.id ? { ...i, artikelname: e.target.value } : i))
                              }}
                              onBlur={(e) => {
                                const newVal = e.target.value.trim() || null
                                saveField(item.id, 'artikelname', newVal)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur()
                                }
                              }}
                              className="h-8"
                              disabled={savingId === item.id}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={item.mindestbestand}
                              onChange={(e) => {
                                const numVal = Number(e.target.value) || 0
                                setProductInfos(prev => prev.map(i => i.id === item.id ? { ...i, mindestbestand: numVal } : i))
                              }}
                              onBlur={(e) => {
                                const newVal = Number(e.target.value) || 0
                                saveField(item.id, 'mindestbestand', newVal)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.currentTarget.blur()
                                }
                              }}
                              className="h-8 text-right"
                              disabled={savingId === item.id}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={item.beutelgroesse || ''}
                              onChange={(e) => {
                                const newVal = e.target.value as 'S' | 'M' | 'L' | '' || null
                                saveField(item.id, 'beutelgroesse', newVal || null)
                              }}
                              className="h-8 border rounded px-2 text-sm"
                              disabled={savingId === item.id}
                            >
                              <option value="">—</option>
                              <option value="S">S</option>
                              <option value="M">M</option>
                              <option value="L">L</option>
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-gray-400">
                            {savingId === item.id ? 'Speichere…' : ''}
                          </td>
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

