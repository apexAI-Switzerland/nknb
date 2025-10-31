// CSV helpers shared across pages
// @ts-ignore - local types may not resolve under bundler moduleResolution
import * as Papa from 'papaparse';

export function stripBom(text: string): string {
  return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function countOutsideQuotes(line: string, ch: string): number {
  let cnt = 0; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') { i++; }
      else { inQ = !inQ; }
    } else if (!inQ && c === ch) { cnt++; }
  }
  return cnt;
}

function replaceOutsideQuotes(line: string, from: string, to: string): string {
  let out = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (i + 1 < line.length && line[i + 1] === '"') { out += '""'; i++; }
      else { inQ = !inQ; out += '"'; }
    } else if (!inQ && c === from) { out += to; }
    else { out += c; }
  }
  return out;
}

export function normalizeDelimiters(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length <= 1) return text;
  const header = lines[0];
  const dataLine = lines.find((l, idx) => idx > 0 && l.trim().length > 0) || '';
  const headerCommas = countOutsideQuotes(header, ',');
  const headerSemicolons = countOutsideQuotes(header, ';');
  const dataCommas = countOutsideQuotes(dataLine, ',');
  const dataSemicolons = countOutsideQuotes(dataLine, ';');
  if (headerCommas > headerSemicolons && dataSemicolons > dataCommas) {
    const normalized = lines.map((l, idx) => idx === 0 ? l : replaceOutsideQuotes(l, ';', ','));
    return normalized.join('\n');
  }
  return text;
}

export function unwrapFullyQuotedLines(text: string): string {
  const lines = text.split('\n');
  const unwrapped = lines.map((l, idx) => {
    if (idx === 0) return l; // keep header
    const t = l.trim();
    if (t.length > 1 && t.startsWith('"') && t.endsWith('"')) {
      return t.slice(1, -1).replace(/""/g, '"');
    }
    return l;
  });
  return unwrapped.join('\n');
}

export function parseCsvToObjects(text: string): { rows: Record<string, string>[]; errors: string[] } {
  const cleaned = unwrapFullyQuotedLines(normalizeDelimiters(stripBom(text)));
  const parsed = Papa.parse(cleaned, { header: true, skipEmptyLines: true, delimiter: ',' }) as any;
  const rawErrors = (parsed && parsed.errors) ? (parsed.errors as Array<{ message?: string }>) : [];
  const errors = rawErrors.map((e: { message?: string }) => e?.message ?? 'Unknown CSV parse error');
  const data = (parsed.data as any[]) || [];
  return { rows: data as Record<string, string>[], errors };
}

export function makeCsvBlobWithBom(lines: string[]): Blob {
  const bom = '\uFEFF';
  return new Blob([bom + lines.join('\r\n') + '\r\n'], { type: 'text/csv' });
}


