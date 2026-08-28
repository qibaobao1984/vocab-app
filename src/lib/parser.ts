import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
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

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  let text: string

  if (ext === 'pdf') {
    text = await extractPdfText(file)
  } else if (ext === 'docx' || ext === 'doc') {
    text = await extractDocxText(file)
  } else if (ext === 'txt') {
    text = await file.text()
  } else {
    throw new Error(`不支持的文件格式: .${ext}，请上传 PDF、Word(.docx) 或 TXT 文件`)
  }

  return parseText(text)
}
