'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// @ts-ignore
import * as Papa from 'papaparse'
import { supabase } from '@/lib/supabase'

type InventoryRow = {
  sku: string
  name?: string
  lagerbestand: number
}

type ConsumptionRow = {
  id?: string
  sku: string
  name: string
  jan?: number
  feb?: number
  mrz?: number
  apr?: number
  mai?: number
  jun?: number
  jul?: number
  aug?: number
  sep?: number
  okt?: number
  nov?: number
  dez?: number
  herkunft?: string
  lieferant?: string
  zwischenhaendler?: string
  lieferzeit?: string
}

type StoredConsumption = ConsumptionRow & { id: string }

type AnalysisResult = {
  sku: string
  name: string
  herkunft: string | null
  lieferant: string | null
  zwischenhaendler: string | null
  lagerbestand: number
  avgVerbrauchMonat: number
  reichweiteMonat: number | null
  lieferzeit: number | null
  status: 'green' | 'yellow' | 'orange' | 'red'
  statusText: string
  lieferzeitWarning: boolean
  trendDirection: 'up' | 'down' | 'stable'
  usedFallback: boolean
}

export default function RawMaterialsPage() {
  const [activeTab, setActiveTab] = useState<'consumption' | 'analysis' | 'history'>('analysis')
  
  // Consumption upload state
  const [uploadingConsumption, setUploadingConsumption] = useState(false)
  const [consumptionFileKey, setConsumptionFileKey] = useState<number>(Date.now())
  const consumptionInputRef = useRef<HTMLInputElement | null>(null)
  const [consumptionYear, setConsumptionYear] = useState<number>(2025)
  const [consumptionMsg, setConsumptionMsg] = useState<string>('')
  const [consumptionPreview, setConsumptionPreview] = useState<ConsumptionRow[]>([])
  const [consumptionAllRows, setConsumptionAllRows] = useState<ConsumptionRow[]>([])
  
  // Inventory upload state
  const [uploadingInventory, setUploadingInventory] = useState(false)
  const [inventoryFileKey, setInventoryFileKey] = useState<number>(Date.now())
  const inventoryInputRef = useRef<HTMLInputElement | null>(null)
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([])
  
  // Analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState<AnalysisResult[] | null>(null)
  const [analysisMsg, setAnalysisMsg] = useState<string>('')
  
  // Stats
  const [stats, setStats] = useState<{ consumptionCount?: number, year?: number }>({})
  
  // Stored consumption data for editing
  const [storedConsumption, setStoredConsumption] = useState<StoredConsumption[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  const parseCSV = (text: string): any[] => {
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: ',' })
    return parsed.data as any[]
  }

  const parseXLSX = async (file: File): Promise<any[]> => {
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
  }

  const normalizeConsumptionRow = (row: any): ConsumptionRow => {
    const keys = Object.fromEntries(Object.keys(row || {}).map(k => [k.trim().toLowerCase(), k]))
    const get = (aliases: string[]) => {
      for (const a of aliases) {
        const k = keys[a]
        if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k]
      }
      return undefined
    }
    
    const sku = String(get(['sku', 'artikelnummer', 'artikelnr', 'id']) || '').trim()
    const name = String(get(['name', 'artikelname', 'produktname', 'bezeichnung']) || '').trim()
    const herkunft = String(get(['herkunft', 'origin']) || '').trim() || undefined
    const lieferant = String(get(['lieferant', 'supplier']) || '').trim() || undefined
    const zwischenhaendler = String(get(['zwischenhaendler', 'zwischenhändler', 'wholesaler', 'intermediary']) || '').trim() || undefined
    const lieferzeit = String(get(['lieferzeit', 'leadtime', 'lead time']) || '').trim() || undefined

    const parseNum = (val: any) => {
      if (val === undefined || val === null || String(val).trim() === '') return undefined
      const num = Number(String(val).replace(',', '.').replace(/\s/g, ''))
      return isNaN(num) ? undefined : num
    }

    return {
      sku,
      name,
      jan: parseNum(get(['jan', 'januar'])),
      feb: parseNum(get(['feb', 'februar'])),
      mrz: parseNum(get(['mrz', 'mär', 'maerz', 'märz', 'mar'])),
      apr: parseNum(get(['apr', 'april'])),
      mai: parseNum(get(['mai', 'may'])),
      jun: parseNum(get(['jun', 'juni'])),
      jul: parseNum(get(['jul', 'juli'])),
      aug: parseNum(get(['aug', 'august'])),
      sep: parseNum(get(['sep', 'sept', 'september'])),
      okt: parseNum(get(['okt', 'oktober', 'oct'])),
      nov: parseNum(get(['nov', 'november'])),
      dez: parseNum(get(['dez', 'dezember', 'dec'])),
      herkunft,
      lieferant,
      zwischenhaendler,
      lieferzeit
    }
  }

  const normalizeInventoryRow = (row: any): InventoryRow => {
    const keys = Object.fromEntries(Object.keys(row || {}).map(k => [k.trim().toLowerCase(), k]))
    const get = (aliases: string[]) => {
      for (const a of aliases) {
        const k = keys[a]
        if (k && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k]
      }
      return undefined
    }
    
    const sku = String(get(['sku', 'artikelnummer', 'artikelnr', 'id']) || '').trim()
    const name = String(get(['name', 'artikelname', 'produktname', 'bezeichnung']) || '').trim()
    const lagerbestand = Number(String(get(['lagerbestand', 'bestand', 'stock', 'qty', 'menge', 'verfügbar', 'verfuegbar']) || '0').replace(',', '.').replace(/\s/g, '')) || 0

    return { sku, name, lagerbestand }
  }

  const handleConsumptionUpload = async (file: File) => {
    try {
      setUploadingConsumption(true)
      setConsumptionMsg('')
      let rows: any[]
      
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        rows = parseCSV(text)
      } else {
        rows = await parseXLSX(file)
      }
      
      const normalized = rows.map(normalizeConsumptionRow).filter(r => r.sku)
      setConsumptionAllRows(normalized) // Store all rows for import
      setConsumptionPreview(normalized.slice(0, 10)) // Preview only first 10
      setConsumptionMsg(`${normalized.length} Zeilen geladen. Klicken Sie "Importieren" um die Daten zu speichern.`)
      setConsumptionFileKey(Date.now())
    } catch (e: any) {
      setConsumptionMsg(`Fehler: ${e.message}`)
    } finally {
      setUploadingConsumption(false)
    }
  }

  const handleConsumptionImport = async () => {
    if (consumptionAllRows.length === 0) return
    
    try {
      setUploadingConsumption(true)
      const { data: sessionData } = await supabase().auth.getSession()
      const accessToken = sessionData.session?.access_token
      
      const res = await fetch('/api/raw-materials/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          rows: consumptionAllRows, // Import ALL rows, not just preview
          year: consumptionYear
        })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      
      setConsumptionMsg(data.message || `${data.imported} Rohstoffe importiert`)
      setConsumptionPreview([])
      setConsumptionAllRows([])
      await loadStats()
      await loadStoredConsumption()
    } catch (e: any) {
      setConsumptionMsg(`Fehler: ${e.message}`)
    } finally {
      setUploadingConsumption(false)
    }
  }

  const handleInventoryUpload = async (file: File) => {
    try {
      setUploadingInventory(true)
      setAnalysisMsg('')
      let rows: any[]
      
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        rows = parseCSV(text)
      } else {
        rows = await parseXLSX(file)
      }
      
      const normalized = rows.map(normalizeInventoryRow).filter(r => r.sku)
      setInventoryRows(normalized)
      setAnalysisMsg(`${normalized.length} Rohstoffe geladen.`)
      setInventoryFileKey(Date.now())
    } catch (e: any) {
      setAnalysisMsg(`Fehler: ${e.message}`)
    } finally {
      setUploadingInventory(false)
    }
  }

  const handleAnalyze = async () => {
    if (inventoryRows.length === 0) {
      setAnalysisMsg('Bitte laden Sie zuerst Lagerbestandsdaten hoch.')
      return
    }
    
    try {
      setAnalyzing(true)
      setResults(null)
      setAnalysisMsg('')
      
      const { data: sessionData } = await supabase().auth.getSession()
      const accessToken = sessionData.session?.access_token
      
      const res = await fetch('/api/raw-materials/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          inventory: inventoryRows,
          year: consumptionYear
        })
      })
      
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      
      setResults(data.results)
      setAnalysisMsg(`Analyse für ${data.results.length} Rohstoffe abgeschlossen.`)
    } catch (e: any) {
      setAnalysisMsg(`Fehler: ${e.message}`)
    } finally {
      setAnalyzing(false)
    }
  }

  const loadStats = async () => {
    const { count } = await supabase()
      .from('raw_material_consumption')
      .select('*', { count: 'exact', head: true })
      .eq('year', consumptionYear)
    
    setStats({ consumptionCount: count || 0, year: consumptionYear })
  }

  const loadStoredConsumption = async () => {
    const { data, error } = await supabase()
      .from('raw_material_consumption')
      .select('*')
      .eq('year', consumptionYear)
      .order('sku', { ascending: true })
    
    if (error) {
      console.error('Error loading consumption:', error)
      return
    }
    
    setStoredConsumption((data || []) as StoredConsumption[])
  }

  const saveField = async (id: string, field: string, value: string) => {
    try {
      setSavingId(id)
      const { data: sessionData } = await supabase().auth.getSession()
      const accessToken = sessionData.session?.access_token
      
      const res = await fetch('/api/raw-materials/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ id, field, value })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Update failed')
      }
      
      // Update local state
      setStoredConsumption(prev => 
        prev.map(item => item.id === id ? { ...item, [field]: value || null } : item)
      )
    } catch (e: any) {
      console.error('Save error:', e)
      // Reload on error
      await loadStoredConsumption()
    } finally {
      setSavingId(null)
    }
  }

  useEffect(() => {
    loadStats()
    loadStoredConsumption()
  }, [consumptionYear])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green': return 'bg-green-100 text-green-800'
      case 'yellow': return 'bg-yellow-100 text-yellow-800'
      case 'orange': return 'bg-orange-100 text-orange-800'
      case 'red': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'green': return 'bg-green-50'
      case 'yellow': return 'bg-yellow-50'
      case 'orange': return 'bg-orange-50'
      case 'red': return 'bg-red-50'
      default: return ''
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return '↑'
      case 'down': return '↓'
      default: return '→'
    }
  }

  const formatReichweite = (reichweiteMonat: number | null): string => {
    if (reichweiteMonat === null) return '∞'
    if (reichweiteMonat < 1) return `${Math.round(reichweiteMonat * 30)} Tage`
    return `${reichweiteMonat.toFixed(1)} Monate`
  }

  const exportResults = () => {
    if (!results || results.length === 0) return
    
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const headers = ['SKU', 'Name', 'Herkunft', 'Lieferant', 'Zwischenhändler', 'Lagerbestand (kg)', 'Ø Verbrauch/Monat (kg)', 'Reichweite', 'Lieferzeit (Monate)', 'Status', 'Trend']
    const rows = results.map(r => [
      esc(r.sku),
      esc(r.name),
      esc(r.herkunft || ''),
      esc(r.lieferant || ''),
      esc(r.zwischenhaendler || ''),
      r.lagerbestand,
      r.avgVerbrauchMonat,
      esc(formatReichweite(r.reichweiteMonat)),
      r.lieferzeit ?? '',
      esc(r.statusText),
      r.trendDirection
    ].join(','))
    
    const csv = [headers.join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rohstoff_analyse.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <main className="container mx-auto px-4 py-8">
      {analyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70">
          <div className="flex flex-col items-center gap-3 p-6 bg-white rounded-md shadow">
            <div className="h-8 w-8 border-2 border-naturkostbar-brown border-t-transparent rounded-full animate-spin" />
            <div className="text-sm text-gray-700">Analyse läuft…</div>
          </div>
        </div>
      )}
      
      <h1 className="text-2xl font-bold mb-6 naturkostbar-accent">Rohstoffplanung</h1>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="analysis">Bestandsanalyse</TabsTrigger>
          <TabsTrigger value="consumption">Verbrauchsdaten</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Aktueller Lagerbestand</CardTitle>
                <CardDescription>
                  CSV oder Excel mit Spalten: SKU, Name, Lagerbestand.<br/>
                  <strong>Hinweis:</strong> Lagerbestand wird in Kilogramm (kg) erwartet.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <input
                    key={inventoryFileKey}
                    ref={inventoryInputRef}
                    type="file"
                    accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleInventoryUpload(f)
                    }}
                    style={{ display: 'none' }}
                  />
                  <Button disabled={uploadingInventory} onClick={() => inventoryInputRef.current?.click()}>
                    {uploadingInventory ? 'Lade…' : 'Lagerbestand hochladen'}
                  </Button>
                  <Button onClick={handleAnalyze} disabled={analyzing || inventoryRows.length === 0}>
                    {analyzing ? 'Analysiere…' : 'Analyse starten'}
                  </Button>
                </div>
                
                {analysisMsg && (
                  <div className="mt-3 text-sm text-gray-600">{analysisMsg}</div>
                )}

                {inventoryRows.length > 0 && !results && (
                  <div className="mt-4">
                    <div className="overflow-x-auto max-h-64">
                      <table className="min-w-full border rounded bg-white text-sm">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="px-3 py-2 text-left">SKU</th>
                            <th className="px-3 py-2 text-left">Name</th>
                            <th className="px-3 py-2 text-right">Lagerbestand (kg)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryRows.slice(0, 10).map((r, i) => (
                            <tr key={i} className="border-b">
                              <td className="px-3 py-2">{r.sku}</td>
                              <td className="px-3 py-2">{r.name}</td>
                              <td className="px-3 py-2 text-right">{r.lagerbestand.toFixed(2)}</td>
                            </tr>
                          ))}
                          {inventoryRows.length > 10 && (
                            <tr>
                              <td colSpan={3} className="px-3 py-2 text-gray-500 text-center">
                                ... und {inventoryRows.length - 10} weitere
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Einstellungen</CardTitle>
                <CardDescription>Parameter für die Analyse</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm mb-1">Verbrauchsdaten Jahr</label>
                    <Input 
                      type="number" 
                      value={consumptionYear} 
                      onChange={(e) => setConsumptionYear(Number(e.target.value))} 
                    />
                  </div>
                  <div className="text-sm text-gray-600">
                    Verfügbare Verbrauchsdaten: {stats.consumptionCount ?? 0} Rohstoffe für {consumptionYear}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {results && results.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>Analyseergebnis</CardTitle>
                      <div className="relative group">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs cursor-help font-medium">?</span>
                        <div className="absolute left-0 top-6 z-50 hidden group-hover:block w-96 p-4 bg-white border border-gray-200 rounded-lg shadow-lg text-sm text-gray-700">
                          <div className="font-semibold mb-2 text-gray-900">Berechnungsalgorithmus</div>
                          <div className="space-y-2">
                            <div>
                              <span className="font-medium">1. Datenbereinigung:</span> Ausreißer werden mit der IQR-Methode (Interquartilsabstand) behandelt - Werte außerhalb von Q1-1.5×IQR bis Q3+1.5×IQR werden begrenzt.
                            </div>
                            <div>
                              <span className="font-medium">2. Gewichteter Durchschnitt:</span> Die letzten 3 Monate (relativ zum aktuellen Datum) werden mit Faktor 2 gewichtet, ältere Monate mit Faktor 1.
                            </div>
                            <div>
                              <span className="font-medium">3. Trend-Erkennung:</span> Lineare Regression über alle Monatswerte. Bei steigendem Trend (+5%) wird der Verbrauch um bis zu 15% erhöht, bei fallendem entsprechend reduziert.
                            </div>
                            <div>
                              <span className="font-medium">4. Reichweite:</span> Lagerbestand (kg) ÷ Ø Verbrauch/Monat = Reichweite in Monaten.
                            </div>
                            <div>
                              <span className="font-medium">5. Lieferzeit-Vergleich:</span> Falls Lieferzeit hinterlegt, wird gewarnt wenn Reichweite {'<'} Lieferzeit.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <CardDescription>
                      Farbschema: <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-xs">{'>'} 3 Monate</span>{' '}
                      <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-xs">2-3 Monate</span>{' '}
                      <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 text-xs">1-2 Monate</span>{' '}
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">{'<'} 1 Monat / Unter Lieferzeit</span>
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={exportResults}>Export CSV</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full border rounded bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Herkunft</th>
                        <th className="px-3 py-2 text-left">Lieferant</th>
                        <th className="px-3 py-2 text-left">Zwischenhändler</th>
                        <th className="px-3 py-2 text-right">Lagerbestand (kg)</th>
                        <th className="px-3 py-2 text-right">Ø Verbrauch/Monat</th>
                        <th className="px-3 py-2 text-right">Reichweite</th>
                        <th className="px-3 py-2 text-right">Lieferzeit</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-center">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => (
                        <tr key={i} className={`border-b ${getStatusBg(r.status)}`}>
                          <td className="px-3 py-2 font-medium">{r.sku}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2 text-gray-600">{r.herkunft || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{r.lieferant || '-'}</td>
                          <td className="px-3 py-2 text-gray-600">{r.zwischenhaendler || '-'}</td>
                          <td className="px-3 py-2 text-right">{r.lagerbestand.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">
                            {r.usedFallback ? (
                              <span className="text-gray-400">-</span>
                            ) : (
                              `${r.avgVerbrauchMonat.toFixed(2)} kg`
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {r.reichweiteMonat === null ? '∞' : (
                              r.reichweiteMonat < 1 
                                ? `${Math.round(r.reichweiteMonat * 30)} Tage`
                                : `${r.reichweiteMonat.toFixed(1)} Monate`
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {r.lieferzeit !== null ? `${r.lieferzeit} Monate` : '-'}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(r.status)}`}>
                              {r.lieferzeitWarning && '⚠️ '}
                              {r.statusText}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-lg">
                            {r.usedFallback ? '-' : getTrendIcon(r.trendDirection)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="consumption" className="mt-4">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Verbrauchsdaten importieren</CardTitle>
              <CardDescription>
                Excel-Datei mit Spalten: SKU, Name, Jan, Feb, Mrz, Apr, Mai, Jun, Jul, Aug, Sep, Okt, Nov, Dez, Herkunft, Lieferant, Zwischenhändler, Lieferzeit (Verbrauchszahlen in kg)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <input
                  key={consumptionFileKey}
                  ref={consumptionInputRef}
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleConsumptionUpload(f)
                  }}
                  style={{ display: 'none' }}
                />
                <Button disabled={uploadingConsumption} onClick={() => consumptionInputRef.current?.click()}>
                  {uploadingConsumption ? 'Lade…' : 'Datei auswählen'}
                </Button>
                <div className="flex items-center gap-2">
                  <label className="text-sm">Jahr:</label>
                  <Input 
                    type="number" 
                    value={consumptionYear} 
                    onChange={(e) => setConsumptionYear(Number(e.target.value))}
                    className="w-24"
                  />
                </div>
                {consumptionAllRows.length > 0 && (
                  <Button onClick={handleConsumptionImport} disabled={uploadingConsumption}>
                    {uploadingConsumption ? 'Importiere…' : `${consumptionAllRows.length} Zeilen importieren`}
                  </Button>
                )}
              </div>
              
              {consumptionMsg && (
                <div className="mb-4 text-sm text-gray-600">{consumptionMsg}</div>
              )}

              {consumptionAllRows.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <div className="text-sm font-medium mb-2">Vorschau der zu importierenden Daten ({consumptionAllRows.length} Zeilen total):</div>
                  <table className="min-w-full border rounded bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-2 py-2 text-left">SKU</th>
                        <th className="px-2 py-2 text-left">Name</th>
                        <th className="px-2 py-2 text-right">Jan</th>
                        <th className="px-2 py-2 text-right">Feb</th>
                        <th className="px-2 py-2 text-right">Mrz</th>
                        <th className="px-2 py-2 text-right">Apr</th>
                        <th className="px-2 py-2 text-right">Mai</th>
                        <th className="px-2 py-2 text-right">Jun</th>
                        <th className="px-2 py-2 text-right">Jul</th>
                        <th className="px-2 py-2 text-right">Aug</th>
                        <th className="px-2 py-2 text-right">Sep</th>
                        <th className="px-2 py-2 text-right">Okt</th>
                        <th className="px-2 py-2 text-right">Nov</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consumptionPreview.slice(0, 10).map((r, i) => (
                        <tr key={i} className="border-b">
                          <td className="px-2 py-2">{r.sku}</td>
                          <td className="px-2 py-2">{r.name}</td>
                          <td className="px-2 py-2 text-right">{r.jan ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.feb ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.mrz ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.apr ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.mai ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.jun ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.jul ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.aug ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.sep ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.okt ?? '-'}</td>
                          <td className="px-2 py-2 text-right">{r.nov ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {consumptionAllRows.length > 10 && (
                    <div className="text-sm text-gray-500 mt-2">... und {consumptionAllRows.length - 10} weitere</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gespeicherte Verbrauchsdaten bearbeiten</CardTitle>
              <CardDescription>
                Bearbeiten Sie Herkunft, Lieferant, Zwischenhändler und Lieferzeit (in Monaten) direkt in der Tabelle. Änderungen werden automatisch gespeichert.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-gray-600 mb-4">
                {storedConsumption.length} Rohstoffe für {consumptionYear} gespeichert
              </div>

              {storedConsumption.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border rounded bg-white text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Herkunft</th>
                        <th className="px-3 py-2 text-left">Lieferant</th>
                        <th className="px-3 py-2 text-left">Zwischenhändler</th>
                        <th className="px-3 py-2 text-left">Lieferzeit (Monate)</th>
                        <th className="px-3 py-2 text-right">Ø Verbrauch/Monat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storedConsumption.map((item) => {
                        // Calculate average consumption
                        const months = [item.jan, item.feb, item.mrz, item.apr, item.mai, item.jun, item.jul, item.aug, item.sep, item.okt, item.nov, item.dez]
                        const validMonths = months.filter(m => m !== null && m !== undefined && !isNaN(Number(m))) as number[]
                        const avgConsumption = validMonths.length > 0 ? validMonths.reduce((a, b) => a + b, 0) / validMonths.length : 0
                        
                        return (
                          <tr key={item.id} className="border-b">
                            <td className="px-3 py-2 font-medium">{item.sku}</td>
                            <td className="px-3 py-2">{item.name || '-'}</td>
                            <td className="px-3 py-2">
                              <Input
                                value={item.herkunft || ''}
                                onChange={(e) => {
                                  setStoredConsumption(prev => 
                                    prev.map(i => i.id === item.id ? { ...i, herkunft: e.target.value } : i)
                                  )
                                }}
                                onBlur={(e) => saveField(item.id, 'herkunft', e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                className="h-8 w-32"
                                disabled={savingId === item.id}
                                placeholder="z.B. Deutschland"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={item.lieferant || ''}
                                onChange={(e) => {
                                  setStoredConsumption(prev => 
                                    prev.map(i => i.id === item.id ? { ...i, lieferant: e.target.value } : i)
                                  )
                                }}
                                onBlur={(e) => saveField(item.id, 'lieferant', e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                className="h-8 w-32"
                                disabled={savingId === item.id}
                                placeholder="z.B. Müller GmbH"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={item.zwischenhaendler || ''}
                                onChange={(e) => {
                                  setStoredConsumption(prev => 
                                    prev.map(i => i.id === item.id ? { ...i, zwischenhaendler: e.target.value } : i)
                                  )
                                }}
                                onBlur={(e) => saveField(item.id, 'zwischenhaendler', e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                className="h-8 w-32"
                                disabled={savingId === item.id}
                                placeholder="z.B. Großhandel AG"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                type="text"
                                value={item.lieferzeit || ''}
                                onChange={(e) => {
                                  setStoredConsumption(prev => 
                                    prev.map(i => i.id === item.id ? { ...i, lieferzeit: e.target.value } : i)
                                  )
                                }}
                                onBlur={(e) => saveField(item.id, 'lieferzeit', e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                className="h-8 w-20"
                                disabled={savingId === item.id}
                                placeholder="z.B. 2"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {avgConsumption > 0 ? `${avgConsumption.toFixed(2)} kg` : '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">
                  Keine Verbrauchsdaten für {consumptionYear} vorhanden. Importieren Sie zuerst eine Datei.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}

