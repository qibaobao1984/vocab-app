import type { WordEntry } from '../types'

export function wordDisplayMeaning(word: WordEntry): string {
  const parts = word.meanings.map((m) => m.meaning).filter(Boolean)
  const unique = [...new Set(parts)]
  return unique.join('；')
}

export function wordPhonetic(word: WordEntry): string | undefined {
  return word.meanings.map((m) => m.phonetic).find(Boolean)
}

export function wordFirstCategoryId(word: WordEntry): number | undefined {
  return word.meanings[0]?.categoryId
}

export function wordHasMeaning(word: WordEntry): boolean {
  return word.meanings.some((m) => m.meaning && m.meaning.trim().length > 0)
}
