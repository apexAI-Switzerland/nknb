'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// @ts-ignore
import * as Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useEffect, useRef } from 'react'

type InventoryRow = {
  Artikelnummer: string
  Artikelname?: string
  Verfuegbar?: number
  Lagerbestand?: number
}

type ResultItem = {
  artikelnummer: string
  name: string
  bag_size?: string | null
  current_stock: number
  final_daily_usage: number
  days_until_stockout: number
  desired_stock: number
  amount_to_produce: number
  priority: 'Hoch' | 'Mittel' | 'Tief'
  used_fallback?: boolean
  to_produce?: boolean
}

export default function ProductionPage() {
  const [uploading, setUploading] = useState(false)
  const [fileInputKey, setFileInputKey] = useState<number>(Date.now())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [rowsPreview, setRowsPreview] = useState<InventoryRow[]>([])
  const [showAllPreview, setShowAllPreview] = useState<boolean>(false)
  const [coverageDays, setCoverageDays] = useState<number>(30)
  const [safetyBuffer, setSafetyBuffer] = useState<number>(5)
  const [holidayLeadTimeDays, setHolidayLeadTimeDays] = useState<number>(20)
  const [holidayFactor, setHolidayFactor] = useState<number>(1.0)
  const [results, setResults] = useState<ResultItem[] | null>(null)
  const [computing, setComputing] = useState(false)
  const [runs, setRuns] = useState<any[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'results' | 'history'>('results')
  const [hideFallback, setHideFallback] = useState<boolean>(false)
  const [onlyProduce, setOnlyProduce] = useState<boolean>(false)
  const resultsRef = useRef<HTMLDivElement | null>(null)

  const arrayToCSV = (data: any[], columns: string[], headers: string[]): string => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = headers.join(',')
    const rows = data.map(r => columns.map(c => esc(r[c])).join(','))
    return [head, ...rows].join('\r\n')
  }

  const exportResults = () => {
    if (!results || results.length === 0) return
    let display = results as ResultItem[]
    if (hideFallback) display = display.filter(r => !r.used_fallback)
    if (onlyProduce) display = display.filter(r => !!r.to_produce)
    const cols = ['priority','artikelnummer','name','bag_size','current_stock','final_daily_usage','days_until_stockout','to_produce']
    const headers = ['Priorität','Artikelnummer','Name','Beutelgröße','Bestand','Tagesverbrauch','Reichweite (Tage)','Zu Produzieren']
    const csv = arrayToCSV(display as any[], cols, headers)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'produktionsplanung.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const parseCSV = (text: string): InventoryRow[] => {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ',' })
    const data = (parsed.data as any[]).map((r) => normalizeRow(r))
    return data
  }

  const parseXLSX = async (file: File): Promise<InventoryRow[]> => {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
    return json.map((r) => normalizeRow(r))
  }

  const normalizeRow = (row: any): InventoryRow => {
    const keys = Object.fromEntries(Object.keys(row || {}).map(k => [k.trim().toLowerCase(), k]))
    const get = (alias: string[]) => {
      for (const a of alias) {
        const k = keys[a]
        if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k]
      }
      return undefined
    }
    const artikelnummer = String(get(['artikelnummer','artikelnr','sku','id']) || '').trim()
    const artikelname = String(get(['artikelname','name','produktname']) || '').trim()
    const verf = get(['verfügbar','verfuegbar','verfuegbarkeit','bestand','lagerbestand','stock','qty'])
    const current = verf !== undefined && verf !== null ? Number(String(verf).replace(/\s/g,'').replace(',','.')) : undefined
    return { Artikelnummer: artikelnummer, Artikelname: artikelname, Verfuegbar: current, Lagerbestand: current }
  }

  const handleUpload = async (file: File) => {
    try {
      setUploading(true)
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        const rows = parseCSV(text)
        setRowsPreview(rows.slice(0, 50))
      } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
        const rows = await parseXLSX(file)
        setRowsPreview(rows.slice(0, 50))
      } else {
        throw new Error('Bitte CSV oder XLSX hochladen')
      }
      setFileInputKey(Date.now())
    } catch (e) {
      // no toast available here; minimal UI
      console.error(e)
    } finally {
      setUploading(false)
    }
  }

  const loadRuns = async () => {
    const { data } = await supabase().from('production_plan_runs').select('*').order('created_at', { ascending: false }).limit(20)
    setRuns(data || [])
  }

  const loadRunItems = async (runId: string) => {
    const { data } = await supabase().from('production_plan_items').select('*').eq('run_id', runId)
    const items = (data || []) as ResultItem[]
    const order: Record<string, number> = { 'Hoch': 0, 'Mittel': 1, 'Tief': 2 }
    items.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3))
    setSelectedRunId(runId)
    setResults(items)
    setActiveTab('results')
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  useEffect(() => {
    loadRuns()
  }, [])

  const handleCompute = async () => {
    try {
      setComputing(true)
      setResults(null)
      const res = await fetch('/api/production/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory: rowsPreview,
          params: { coverageDays, safetyBuffer, holidayLeadTimeDays },
        })
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      const items = (data.items || []) as ResultItem[]
      const order: Record<string, number> = { 'Hoch': 0, 'Mittel': 1, 'Tief': 2 }
      items.sort((a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3))
      setResults(items)
      await loadRuns()
      setActiveTab('results')
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (e) {
      console.error(e)
    } finally {
      setComputing(false)
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      {computing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70">
          <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-md shadow">
            <div className="h-8 w-8 border-2 border-naturkostbar-brown border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-gray-700">Berechnung läuft…</div>
          </div>
        </div>
      )}
      <h1 className="text-2xl font-bold mb-6 naturkostbar-accent">Produktionsplanung</h1>

      <div className="mb-4">
        <Link href="/production/admin" className="text-sm text-naturkostbar-brown underline">Zur Administration (Verkäufe/Mindestbestand)</Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Aktueller Lagerbestand</CardTitle>
            <CardDescription>CSV oder Excel mit Artikelnummer, Artikelname und Lagerbestand hochladen.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <input
                key={fileInputKey}
                ref={fileInputRef}
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleUpload(f)
                }}
                style={{ display: 'none' }}
              />
              <Button disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? 'Lade…' : 'Lagerbestand hochladen'}</Button>
            </div>
            {rowsPreview.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border rounded bg-white text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left">Artikelnummer</th>
                      <th className="px-3 py-2 text-left">Artikelname</th>
                      <th className="px-3 py-2 text-right">Lagerbestand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllPreview ? rowsPreview : rowsPreview.slice(0, 10)).map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2">{r.Artikelnummer}</td>
                        <td className="px-3 py-2">{r.Artikelname}</td>
                        <td className="px-3 py-2 text-right">{r.Verfuegbar ?? r.Lagerbestand ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rowsPreview.length > 10 && (
                  <div className="mt-3">
                    <Button variant="outline" onClick={() => setShowAllPreview(!showAllPreview)}>
                      {showAllPreview ? 'Weniger anzeigen' : `Alle anzeigen (${rowsPreview.length})`}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Parameter</CardTitle>
            <CardDescription>Einstellungen für die Berechnung.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <label className="block text-sm mb-1">
                  Planungshorizont (Tage Vorrat)
                  <span
                    className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-700 text-xs cursor-help"
                    title="Wie viele Tage Vorrat sollen abgedeckt sein? Je höher, desto mehr wird produziert, um den Zeitraum zu decken."
                  >?</span>
                </label>
                <Input type="number" value={coverageDays} onChange={(e) => setCoverageDays(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm mb-1">
                  Sicherheitspuffer (Tage)
                  <span
                    className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-700 text-xs cursor-help"
                    title="Zusätzliche Tage als Puffer, um Schwankungen abzufedern. Wenn die Reichweite kleiner als Produktionsdauer + Puffer ist, wird produziert."
                  >?</span>
                </label>
                <Input type="number" value={safetyBuffer} onChange={(e) => setSafetyBuffer(Number(e.target.value))} />
              </div>
              {/* Produktionsdauer (Tage) entfernt – wird nicht global verwendet */}
              <div>
                <label className="block text-sm mb-1">
                  Feiertags-Vorlauf (Tage)
                  <span
                    className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-700 text-xs cursor-help"
                    title="Zeitraum vor Ostern/Weihnachten, in dem ein Aufschlag (z. B. 15%) eingerechnet wird."
                  >?</span>
                </label>
                <Input type="number" value={holidayLeadTimeDays} onChange={(e) => setHolidayLeadTimeDays(Number(e.target.value))} />
              </div>
              <div className="text-sm text-gray-600">
                Feiertagsfaktor (automatisch)
                <span
                  className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-gray-700 text-xs cursor-help"
                  title="Wenn aktuell Oster-/Weihnachtszeit (inkl. Vorlauf), wird ein Faktor (z. B. 1.15) angewendet, um den Zielbestand zu erhöhen."
                >?</span>: {holidayFactor.toFixed(2)}
              </div>
              <Button className="w-full" onClick={handleCompute}>Plan erstellen</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="results">Ergebnis</TabsTrigger>
            <TabsTrigger value="history">Historie</TabsTrigger>
          </TabsList>
          <TabsContent value="results" className="mt-4">
            <div ref={resultsRef} />
            {!results || results.length === 0 ? (
              <div className="text-gray-500 text-sm">Noch keine Ergebnisse. Laden Sie einen Lagerbestand hoch und erstellen Sie den Plan.</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-4 text-sm">
                    <input id="hideFallback" type="checkbox" className="h-4 w-4" checked={hideFallback} onChange={(e) => setHideFallback(e.target.checked)} />
                    <label htmlFor="hideFallback">Fallback-Produkte ausblenden</label>
                    <span className="inline-block w-px h-5 bg-gray-200" />
                    <span>Nur „Zu Produzieren“</span>
                    <input id="onlyProduce" type="checkbox" className="h-4 w-4" checked={onlyProduce} onChange={(e) => setOnlyProduce(e.target.checked)} />
                  </div>
                  <Button variant="outline" onClick={exportResults}>Export CSV</Button>
                </div>
                <table className="min-w-full border rounded bg-white text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left">Priorität</th>
                      <th className="px-3 py-2 text-left">Artikelnummer</th>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Beutelgröße</th>
                      <th className="px-3 py-2 text-right">Bestand</th>
                      <th className="px-3 py-2 text-right">Tagesverbrauch</th>
                      <th className="px-3 py-2 text-right">Reichweite (Tage)</th>
                      <th className="px-3 py-2 text-left">Zu produzieren</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(results.filter(r => {
                      if (onlyProduce && !r.to_produce) return false
                      if (hideFallback && r.used_fallback) return false
                      return true
                    })).map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="px-3 py-2">{r.priority}</td>
                        <td className="px-3 py-2">{r.artikelnummer}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">{r.bag_size || ''}</td>
                        <td className="px-3 py-2 text-right">{r.current_stock.toFixed(0)}</td>
                        <td className="px-3 py-2 text-right">
                          {r.final_daily_usage.toFixed(2)}
                          {r.used_fallback ? (
                            <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800 align-middle" title="Kein Verlauf vorhanden – Minimalwert 0.10 verwendet">Fallback</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">{r.days_until_stockout.toFixed(1)}</td>
                        <td className="px-3 py-2">{r.to_produce ? 'Ja' : 'Nein'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            {runs.length === 0 ? (
              <div className="text-gray-500 text-sm">Keine Läufe vorhanden.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border rounded bg-white text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left">Zeitpunkt</th>
                      <th className="px-3 py-2 text-right">Planungshorizont (Tage Vorrat)</th>
                      <th className="px-3 py-2 text-right">Sicherheitspuffer (Tage)</th>
                      <th className="px-3 py-2 text-right">Feiertagsfaktor</th>
                      <th className="px-3 py-2 text-right">Verkaufsjahr</th>
                      <th className="px-3 py-2 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className={`border-b ${selectedRunId === r.id ? 'bg-gray-50' : ''}`}>
                        <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{r.coverage_days}</td>
                        <td className="px-3 py-2 text-right">{r.safety_buffer}</td>
                        
                        <td className="px-3 py-2 text-right">{Number(r.holiday_factor).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right">{r.sales_year}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="outline" onClick={() => loadRunItems(r.id)}>Anzeigen</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}


