import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import type { ParsedWord } from '../types'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export interface ParseResult {
  words: ParsedWord[]
  totalLines: number
}

interface TextItem {
  str: string
  transform: number[]
}

export async function extractPdfText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const lines: string[] = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    const items = content.items as unknown as TextItem[]
    const pageLines = groupIntoLines(items)
    lines.push(...pageLines)
  }
  return lines.join('\n')
}

function groupIntoLines(items: TextItem[]): string[] {
  const result: string[] = []
  let currentLine = ''
  let lastY: number | null = null

  for (const item of items) {
    const y = item.transform[5]
    if (lastY !== null && Math.abs(y - lastY) > 3) {
      result.push(currentLine.trim())
      currentLine = ''
    }
    currentLine += item.str
    lastY = y
  }
  if (currentLine.trim()) result.push(currentLine.trim())
  return result
}

export async function extractDocxText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return result.value
}

function cleanLine(line: string): string {
  return line
    .replace(/^[\s]*[\d]+[.)\]]?\s*/, '')
    .replace(/^[•·▪◦●\-–—*▪►►▸▸]+\s*/, '')
    .trim()
}

const DELIMITERS = ['——', '—', '–', '\t', '   ']

function splitWordMeaning(line: string): ParsedWord | null {
  const cleaned = cleanLine(line)
  if (!cleaned) return null

  for (const delim of DELIMITERS) {
    const idx = cleaned.indexOf(delim)
    if (idx > 0 && idx < cleaned.length - delim.length) {
      const left = cleaned.slice(0, idx).trim()
      const right = cleaned.slice(idx + delim.length).trim()
      return buildParsedWord(left, right)
    }
  }

  const dashMatch = cleaned.match(/^(.+?)\s+[–\-]\s+(.+)$/)
  if (dashMatch) {
    return buildParsedWord(dashMatch[1].trim(), dashMatch[2].trim())
  }

  const parts = cleaned.split(/\s{2,}/)
  if (parts.length >= 2) {
    return buildParsedWord(parts[0].trim(), parts.slice(1).join(' ').trim())
  }

  const tokens = cleaned.split(/\s+/)
  if (tokens.length === 1) {
    const word = tokens[0]
    if (/^[a-zA-Z]/.test(word)) {
      return { text: word, meaning: '' }
    }
  } else {
    const first = tokens[0]
    const rest = tokens.slice(1).join(' ')
    if (/^[a-zA-Z][\w'-]*$/.test(first)) {
      return buildParsedWord(first, rest)
    }
  }

  return null
}

function buildParsedWord(left: string, right: string): ParsedWord {
  const phoneticMatch = left.match(/^(.+?)\s*[\/\[]([^\]\/]+)[\/\]]\s*$/)
  if (phoneticMatch) {
    return {
      text: phoneticMatch[1].trim(),
      meaning: right,
      phonetic: phoneticMatch[2].trim(),
    }
  }
  const phoneticInRight = right.match(/^[\/\[]([^\]\/]+)[\/\]]\s*(.*)$/)
  if (phoneticInRight) {
    return {
      text: left,
      meaning: phoneticInRight[2].trim(),
      phonetic: phoneticInRight[1].trim(),
    }
  }
  return { text: left, meaning: right }
}

export function parseText(text: string): ParseResult {
  const lines = text.split(/\r?\n/)
  const words: ParsedWord[] = []
  let totalLines = 0

  for (const line of lines) {
    if (!line.trim()) continue
    totalLines++
    const parsed = splitWordMeaning(line)
    if (parsed && parsed.text) {
      words.push(parsed)
    }
  }

  const seen = new Set<string>()
  const unique = words.filter((w) => {
    const key = w.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { words: unique, totalLines }
}

export async function extractExcelRows(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
  return rows.map((row) => (row || []).map((cell) => String(cell ?? '').trim()))
}

const HEADER_KEYWORDS = ['word', '单词', '英文', '词汇', 'term', 'text', '词', 'meaning', '释义', '中文', 'meaning', '翻译', 'phonetic', '音标', 'example', '例句']

function isHeaderRow(row: string[]): boolean {
  const lower = row.map((c) => c.toLowerCase())
  return lower.some((c) => HEADER_KEYWORDS.includes(c))
}

export function parseExcelRows(rows: string[][]): ParseResult {
  const words: ParsedWord[] = []
  let totalLines = 0
  let skippedHeader = false

  for (const row of rows) {
    if (!row.length || row.every((c) => !c)) continue
    totalLines++
    if (!skippedHeader && isHeaderRow(row)) {
      skippedHeader = true
      continue
    }
    const word = row[0] || ''
    const meaning = row[1] || ''
    if (!word) continue
    if (row.length === 1 || !meaning) {
      const parsed = splitWordMeaning(row[0])
      if (parsed && parsed.text) {
        words.push(parsed)
      }
      continue
    }
    words.push({
      text: word,
      meaning,
      phonetic: row[2] || undefined,
      example: row[3] || undefined,
    })
  }

  const seen = new Set<string>()
  const unique = words.filter((w) => {
    const key = w.text.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { words: unique, totalLines }
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  let text: string

  if (ext === 'pdf') {
    text = await extractPdfText(file)
  } else if (ext === 'docx' || ext === 'doc') {
    text = await extractDocxText(file)
  } else if (ext === 'txt') {
    text = await file.text()
  } else if (ext === 'xlsx' || ext === 'xls') {
    const rows = await extractExcelRows(file)
    return parseExcelRows(rows)
  } else {
    throw new Error(`不支持的文件格式: .${ext}，请上传 Excel、PDF、Word(.docx) 或 TXT 文件`)
  }

  return parseText(text)
}
