import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { repoWords, repoWordCount, repoCategories, repoSaveQuizProgress, repoLoadQuizProgress, repoClearQuizProgress, repoMarkLearnedToday } from '../lib/repo'
import { useStore } from '../store/useStore'
import { useDailyGoal } from '../store/dailyGoalStore'
import { speak, speakGrade } from '../lib/tts'
import { wordDisplayMeaning, wordPhonetic, wordFirstCategoryId, wordHasMeaning } from '../lib/word'
import { CategoryMultiSelect } from './CategoryMultiSelect'
import { Page } from './Page'
import { EmptyState } from './EmptyState'
import type { WordEntry, Category, WrongRecord, Mistake } from '../types'
import { familyOf, memberOf, randomDistractors, eligibleWords, POS_LABELS } from '../lib/wordFamilies'
import clsx from 'clsx'

type Mode = 'menu' | 'choice' | 'spell' | 'posconv' | 'polysemy' | 'mixed' | 'result'
type QuizMode = 'choice' | 'spell' | 'posconv' | 'polysemy' | 'mixed'
interface ChoiceQuestion {
  type: 'word-to-meaning' | 'meaning-to-word' | 'posconv'
  word: WordEntry
  prompt?: string
  options: string[]
  answer: number
}
interface SpellQuestion {
  word: WordEntry
  hint?: string
}
interface PolysemyQuestion {
  kind: 'polysemy'
  word: WordEntry
  meaning: string
  answers: string[]
  answerTexts: string[]
  required: number
  words: WordEntry[]
}
type QuizQuestion = ChoiceQuestion | SpellQuestion | PolysemyQuestion
function questionMode(q: QuizQuestion): 'choice' | 'spell' | 'posconv' | 'polysemy' {
  if ('options' in q) return q.type === 'posconv' ? 'posconv' : 'choice'
  if ('kind' in q) return 'polysemy'
  return 'spell'
}
function firstLetterHint(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => {
      if (w.length === 0) return ''
      if (!/[a-zA-Z]/.test(w.charAt(0))) return w
      return w.charAt(0) + '___'
    })
    .join(' ')
}
function buildPolysemyQuestions(words: WordEntry[], difficulty: 'easy' | 'classic' | 'hardcore'): PolysemyQuestion[] {
  const groups = new Map<string, Map<number, WordEntry>>()
  for (const w of words) {
    if (w.id == null) continue
    const seen = new Set<string>()
    for (const m of w.meanings) {
      const key = m.meaning.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      let g = groups.get(key)
      if (!g) {
        g = new Map()
        groups.set(key, g)
      }
      g.set(w.id, w)
    }
  }
  const level = difficulty === 'easy' ? 1 : difficulty === 'classic' ? 2 : 3
  const result: PolysemyQuestion[] = []
  for (const [meaning, g] of groups) {
    const ws = shuffle([...g.values()])
    if (ws.length < 2) continue
    const required = Math.min(level, ws.length)
    result.push({
      kind: 'polysemy',
      word: ws[0],
      meaning,
      answers: ws.map((w) => w.text.trim().toLowerCase()),
      answerTexts: ws.map((w) => w.text),
      required,
      words: ws,
    })
  }
  return shuffle(result)
}
interface WrongItem {
  word: WordEntry
  correctAns: string
  userAns: string
  timedOut: boolean
  mode: 'choice' | 'spell' | 'posconv' | 'polysemy'
  spellDifficulty?: 'easy' | 'classic'
  poly?: { meaning: string; answerTexts: string[]; required: number }
}

const OPTION_COUNT = 4
const HARDCORE_OPTION_COUNT = 6
const SIZE_ALL = -1
const SIZE_PRESETS = [
  { value: 50, label: '50 题' },
  { value: 100, label: '100 题' },
  { value: SIZE_ALL, label: '所有' },
]
const CHOICE_TIME = 15
const SPELL_TIME = 60
const POLY_TIME = 60
const RESULT_PAGE_SIZE = 12

interface SavedQuizState {
  mode: 'choice' | 'spell' | 'posconv' | 'polysemy' | 'mixed'
  questions: QuizQuestion[]
  index: number
  stats: { correct: number; total: number }
  wrongItems: WrongItem[]
  quizMode: QuizMode
  quizLabel: string
  quizSize: number
  quizRetest?: boolean
  activeMs: number
  feedback: { correct: boolean; correctAns: string; timedOut?: boolean } | null
  hinted: number[]
  spellDifficulty?: 'easy' | 'classic'
  polyDifficulty?: 'easy' | 'classic' | 'hardcore'
  polyInputs?: string[]
  polyResults?: (boolean | null)[]
}

function saveQuizState(state: SavedQuizState) {
  void repoSaveQuizProgress(state).catch(() => {
    // ignore
  })
}

async function loadQuizState(): Promise<SavedQuizState | null> {
  try {
    const s = await repoLoadQuizProgress()
    return (s as SavedQuizState | null) ?? null
  } catch {
    return null
  }
}

function clearQuizState() {
  void repoClearQuizProgress().catch(() => {
    // ignore
  })
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildChoiceQuestion(word: WordEntry, allWords: WordEntry[], optionCount: number, hardcore: boolean): ChoiceQuestion {
  const type = Math.random() > 0.5 ? 'word-to-meaning' : 'meaning-to-word'
  const wordMeaning = wordDisplayMeaning(word) || '(无释义)'

  let distractorPool = allWords.filter((w) => w.id !== word.id && wordHasMeaning(w))
  if (hardcore) {
    const sameCat = word.meanings.map((m) => m.categoryId)
    const similar = distractorPool.filter((w) =>
      w.meanings.some((m) => sameCat.includes(m.categoryId)) ||
      w.text.toLowerCase().startsWith(word.text.toLowerCase().slice(0, 2)),
    )
    if (similar.length >= optionCount - 1) {
      distractorPool = similar
    }
  }
  const distractors = shuffle(distractorPool).slice(0, optionCount - 1)
  const pool = [...distractors, word]
  const ordered = shuffle(pool)

  if (type === 'word-to-meaning') {
    const options = ordered.map((w) => wordDisplayMeaning(w) || '(无释义)')
    return { type, word, options, answer: options.indexOf(wordMeaning) }
  } else {
    const options = ordered.map((w) => w.text)
    return { type, word, options, answer: options.indexOf(word.text) }
  }
}

function buildPosConvQuestion(word: WordEntry): ChoiceQuestion | null {
  const src = memberOf(word.text)
  const fam = familyOf(word.text)
  if (!src || !fam || fam.members.length < 2) return null
  const targets = fam.members.filter((m) => m.word.toLowerCase() !== src.word.toLowerCase())
  if (targets.length === 0) return null
  const target = targets[Math.floor(Math.random() * targets.length)]
  const correct = target.word
  let distractors = randomDistractors(target, OPTION_COUNT - 1)
  if (distractors.length < OPTION_COUNT - 1) {
    const extra = shuffle(
      fam.members.filter((m) => m.word.toLowerCase() !== correct.toLowerCase() && m.word.toLowerCase() !== src.word.toLowerCase()),
    )
    for (const m of extra) {
      if (distractors.length >= OPTION_COUNT - 1) break
      if (!distractors.includes(m.word)) distractors.push(m.word)
    }
  }
  const pool = [...distractors, correct]
  const options = shuffle(pool)
  const prompt = `${src.word}（${POS_LABELS[src.pos]}）的 ${POS_LABELS[target.pos]} 形式`
  return { type: 'posconv', word, prompt, options, answer: options.indexOf(correct) }
}

function gradeOf(accuracy: number): { text: string; emoji: string; gradient: string; shadow: string; box: string } {
  if (accuracy >= 95) {
    return {
      text: '夯爆了',
      emoji: '🏆',
      gradient: 'linear-gradient(135deg, #d97706, #fbbf24, #fde047)',
      shadow: 'drop-shadow(0 0 12px rgba(251,191,36,0.6))',
      box: 'bg-amber-100 dark:bg-amber-900/40',
    }
  }
  if (accuracy >= 90) {
    return {
      text: '顶级',
      emoji: '👑',
      gradient: 'linear-gradient(135deg, #2563eb, #3b82f6, #22d3ee)',
      shadow: 'drop-shadow(0 0 12px rgba(59,130,246,0.6))',
      box: 'bg-blue-100 dark:bg-blue-900/40',
    }
  }
  if (accuracy >= 80) {
    return {
      text: '人上人',
      emoji: '😎',
      gradient: 'linear-gradient(135deg, #16a34a, #4ade80, #22d3ee)',
      shadow: 'drop-shadow(0 0 12px rgba(34,197,94,0.6))',
      box: 'bg-green-100 dark:bg-green-900/40',
    }
  }
  if (accuracy >= 60) {
    return {
      text: 'NPC',
      emoji: '🤖',
      gradient: 'linear-gradient(135deg, #6b7280, #9ca3af, #d1d5eb)',
      shadow: 'drop-shadow(0 0 12px rgba(107,114,128,0.5))',
      box: 'bg-gray-100 dark:bg-gray-700/40',
    }
  }
  return {
    text: '拉完了',
    emoji: '💩',
    gradient: 'linear-gradient(135deg, #dc2626, #ef4444, #f87171)',
    shadow: 'drop-shadow(0 0 12px rgba(239,68,68,0.6))',
    box: 'bg-red-100 dark:bg-red-900/40',
  }
}

export function QuizView({ active }: { active: boolean }) {
  const markQuizResult = useStore((s) => s.markQuizResult)
  const recordMistake = useStore((s) => s.recordMistake)
  const resolveMistake = useStore((s) => s.resolveMistake)
  const quizSeed = useStore((s) => s.quizSeed)
  const clearQuizSeed = useStore((s) => s.clearQuizSeed)
  const saveQuizSession = useStore((s) => s.saveQuizSession)
  const refreshKey = useStore((s) => s.refreshKey)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const [mode, setMode] = useState<Mode>('menu')
  const [starting, setStarting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [spellInput, setSpellInput] = useState('')
  const [spellConfirm, setSpellConfirm] = useState(false)
  const [imeComposing, setImeComposing] = useState(false)
  const [spellFocused, setSpellFocused] = useState(false)
  const [feedback, setFeedback] = useState<null | { correct: boolean; correctAns: string; timedOut?: boolean }>(null)
  const [stats, setStats] = useState({ correct: 0, total: 0 })
  const [wrongItems, setWrongItems] = useState<WrongItem[]>([])
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('')
  const [hintedSet, setHintedSet] = useState<Set<number>>(new Set())
  const spellTotal = questions.reduce((n, q) => n + ('options' in q ? 0 : 1), 0)
  const maxHints = Math.floor(spellTotal * 0.2)
  const [quizMode, setQuizMode] = useState<QuizMode>('choice')
  const [quizLabel, setQuizLabel] = useState<string>('全部类别')
  const [quizRetest, setQuizRetest] = useState(false)
  const [wordPool, setWordPool] = useState<WordEntry[]>([])
  const [dbWordCount, setDbWordCount] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCats, setSelectedCats] = useState<Set<number>>(new Set())
  const catInitRef = useRef(false)
  const [quizSize, setQuizSize] = useState<number>(50)
  const [customSize, setCustomSize] = useState<string>('')
  const [difficulty, setDifficulty] = useState<'classic' | 'hardcore'>('classic')
  const [spellDifficulty, setSpellDifficulty] = useState<'easy' | 'classic'>('classic')
  const [polyDifficulty, setPolyDifficulty] = useState<'easy' | 'classic' | 'hardcore'>('classic')
  const [polyInputs, setPolyInputs] = useState<string[]>([])
  const [polyResults, setPolyResults] = useState<(boolean | null)[]>([])
  const [polyWrongShake, setPolyWrongShake] = useState(false)
  const [timeLeft, setTimeLeft] = useState(CHOICE_TIME)
  const answeredRef = useRef(false)
  const autoNextRef = useRef<number | null>(null)
  const intervalRef = useRef<number | null>(null)
  const deadlineRef = useRef(0)
  const spellInputRef = useRef<HTMLInputElement>(null)
  const polyInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const pauseAtRef = useRef<number | null>(null)
  const polySubmitAtRef = useRef(0)
  const activeMsRef = useRef(0)
  const resumeCheckedRef = useRef(false)
  const seedStartedRef = useRef(false)

  useEffect(() => {
    let active = true
    Promise.all([repoCategories(), repoWordCount(), repoWords()]).then(([cats, count, all]) => {
      if (!active) return
      setCategories(cats)
      setWordPool(all)
      if (!catInitRef.current && cats.length > 0) {
        catInitRef.current = true
        setSelectedCats(new Set())
      }
      setDbWordCount(count)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey])

  useEffect(() => {
    setPage(1)
  }, [mode])

  const allWords = useMemo(() => {
    if (selectedCats.size === 0) return []
    const words = wordPool.filter((w) => w.meanings.some((m) => selectedCats.has(m.categoryId)))
    const withMeaning = words.filter((x) => wordHasMeaning(x))
    return withMeaning.length >= OPTION_COUNT ? withMeaning : words
  }, [wordPool, selectedCats])

  const quizCategoryLabel = useMemo(() => {
    if (selectedCats.size === 0) return '无类别'
    if (selectedCats.size >= categories.length) return '全部类别'
    const names = categories
      .filter((c) => selectedCats.has(c.id!))
      .map((c) => c.name)
    if (names.length <= 3) return names.join('、')
    return `${names.length}个类别`
  }, [selectedCats, categories])

  const polysemyGroupCount = useMemo(() => {
    const groups = new Map<string, Set<number>>()
    for (const w of allWords) {
      if (w.id == null) continue
      const seen = new Set<string>()
      for (const m of w.meanings) {
        const key = m.meaning.trim()
        if (!key || seen.has(key)) continue
        seen.add(key)
        let g = groups.get(key)
        if (!g) { g = new Set(); groups.set(key, g) }
        g.add(w.id)
      }
    }
    let count = 0
    for (const g of groups.values()) if (g.size >= 2) count++
    return count
  }, [allWords])

  const beginQuiz = useCallback((qs: QuizQuestion[], qm: QuizMode, label: string, retest: boolean) => {
    setQuestions(qs)
    setQuizMode(qm)
    setQuizLabel(label)
    setQuizRetest(retest)
    setMode(qm)
    setIndex(0)
    setSelected(null)
    setSpellInput('')
    setSpellConfirm(false)
    setFeedback(null)
    setStats({ correct: 0, total: 0 })
    setWrongItems([])
    setHintedSet(new Set())
    setPolyInputs([])
    setPolyResults([])
    setPolyWrongShake(false)
    answeredRef.current = false
    activeMsRef.current = 0
  }, [])

  const startQuiz = useCallback(
    async (qm: QuizMode, pool?: WordEntry[], mixedModes?: Mistake['mode'][], retest?: boolean, spDiff?: 'easy' | 'classic', wordSpellDiff?: Record<number, 'easy' | 'classic'>) => {
      const effSpellDiff = spDiff ?? spellDifficulty
      if (spDiff) setSpellDifficulty(spDiff)
      const diffFor = (w: WordEntry): 'easy' | 'classic' => {
        if (wordSpellDiff && w.id != null && wordSpellDiff[w.id]) return wordSpellDiff[w.id]
        return effSpellDiff
      }
      const begin = (qs: QuizQuestion[]) => {
        beginQuiz(qs, qm, retest ? '错题重默' : pool ? '卡片选词' : quizCategoryLabel, !!retest)
      }
      if (qm === 'mixed') {
        if (!pool || pool.length === 0) return
        const modes = mixedModes ?? []
        const pairs = shuffle(pool.map((w, i) => ({ w, m: modes[i] ?? ('choice' as const) })))
        const distractors = allWords.length > 0 ? allWords : wordPool
        const qs: QuizQuestion[] = []
        for (const p of pairs) {
          if (p.m === 'spell') {
            qs.push({ word: p.w, hint: diffFor(p.w) === 'easy' ? firstLetterHint(p.w.text) : undefined })
          } else if (p.m === 'posconv') {
            const q = buildPosConvQuestion(p.w)
            if (q) qs.push(q)
          } else {
            qs.push(buildChoiceQuestion(p.w, distractors, OPTION_COUNT, false))
          }
        }
        if (qs.length === 0) return
        begin(qs)
        return
      }
      if (qm === 'polysemy') {
        const source = pool ?? allWords
        if (source.length === 0) return
        let polyQs = buildPolysemyQuestions(source, polyDifficulty)
        if (pool) {
          // retest path: keep only groups that contain a pool word, cap required
        }
        const size = pool ? polyQs.length : (quizSize === SIZE_ALL ? polyQs.length : Math.min(quizSize, polyQs.length))
        polyQs = polyQs.slice(0, size)
        if (polyQs.length === 0) return
        begin(polyQs)
        return
      }
      let source = pool ?? allWords
      if (qm === 'posconv') source = eligibleWords(source)
      if (source.length === 0) return
      const distractors = allWords.length > 0 ? allWords : wordPool
      const shuffled = shuffle(source)
      const size = pool ? shuffled.length : (quizSize === SIZE_ALL ? shuffled.length : Math.min(quizSize, shuffled.length))
      let picked = shuffled.slice(0, size)
      if (qm === 'posconv') {
        picked = picked.map((w) => w).filter((w) => buildPosConvQuestion(w) !== null)
        if (picked.length === 0) return
      }
      let qs: QuizQuestion[]
      if (qm === 'choice' || qm === 'posconv') {
        const hc = qm === 'choice' && difficulty === 'hardcore'
        const optCount = hc ? HARDCORE_OPTION_COUNT : OPTION_COUNT
        qs = picked.map((w) => (qm === 'posconv' ? buildPosConvQuestion(w)! : buildChoiceQuestion(w, distractors, optCount, hc)))
      } else {
        qs = picked.map((w) => ({ word: w, hint: diffFor(w) === 'easy' ? firstLetterHint(w.text) : undefined }))
      }
      begin(qs)
    },
    [allWords, wordPool, quizSize, quizCategoryLabel, difficulty, spellDifficulty, polyDifficulty, beginQuiz],
  )

  const next = useCallback(() => {
    if (autoNextRef.current !== null) {
      window.clearTimeout(autoNextRef.current)
      autoNextRef.current = null
    }
    answeredRef.current = false
    setSelected(null)
    setSpellInput('')
    setSpellConfirm(false)
    setFeedback(null)
    setPolyInputs([])
    setPolyResults([])
    setPolyWrongShake(false)
    if (index + 1 >= questions.length) {      setMode('result')
    } else {
      setIndex((i) => i + 1)
    }
  }, [index, questions.length])

  const endQuiz = useCallback(() => {
    if (autoNextRef.current !== null) {
      window.clearTimeout(autoNextRef.current)
      autoNextRef.current = null
    }
    setMode('result')
  }, [])

  const handleTimeout = () => {
    if (answeredRef.current) return
    answeredRef.current = true
    const q = questions[index]
    if (!q) return
    const word = q.word
    const qMode = questionMode(q)
    if (qMode === 'polysemy' && 'kind' in q && q.kind === 'polysemy') {
      const correctAns = q.answerTexts.join(' / ')
      const polyVals = Array.from({ length: q.required }, (_, i) => (polyInputRefs.current[i]?.value ?? '').replace(/[^\x20-\x7E]/g, '').trim()).filter(Boolean)
      const userAns = polyVals.length > 0 ? polyVals.join(' / ') : '（超时未答）'
      const correct = false
      setFeedback({ correct, correctAns, timedOut: true })
      setStats((s) => ({ correct: s.correct, total: s.total + 1 }))
      for (const w of q.words) markQuizResult(w.id!, false, qMode)
      setWrongItems((prev) => [...prev, {
        word,
        correctAns,
        userAns,
        timedOut: true,
        mode: qMode,
        poly: { meaning: q.meaning, answerTexts: q.answerTexts, required: q.required },
      }])
      autoNextRef.current = window.setTimeout(() => next(), 3000)
      return
    }
    const correctAns = 'options' in q ? q.options[q.answer] : word.text
    const spDiff = !('options' in q) && !('kind' in q) ? (q.hint ? 'easy' : 'classic') : undefined
    setFeedback({ correct: false, correctAns, timedOut: true })
    setStats((s) => ({ correct: s.correct, total: s.total + 1 }))
    markQuizResult(word.id!, false, qMode)
    setWrongItems((prev) => [...prev, {
      word,
      correctAns,
      userAns: '（超时未答）',
      timedOut: true,
      mode: qMode,
      spellDifficulty: spDiff,
    }])
    void recordMistake({
      wordId: word.id!,
      categoryId: wordFirstCategoryId(word) ?? 0,
      userAnswer: '（超时未答）',
      correctAnswer: correctAns,
      mode: qMode,
      timedOut: true,
      spellDifficulty: spDiff,
    })
    autoNextRef.current = window.setTimeout(() => next(), 3000)
  }
  const handleTimeoutRef = useRef(handleTimeout)
  handleTimeoutRef.current = handleTimeout

  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (mode !== 'choice' && mode !== 'spell' && mode !== 'posconv' && mode !== 'polysemy' && mode !== 'mixed') return
    if (feedback) return
    if (!active) {
      if (pauseAtRef.current === null) pauseAtRef.current = Date.now()
      return
    }
    const curQ = questions[index]
    const isPoly = curQ ? ('kind' in curQ && curQ.kind === 'polysemy') : mode === 'polysemy'
    const isSpellQ = curQ ? (!('options' in curQ) && !isPoly) : mode === 'spell'
    const limit = isPoly ? POLY_TIME : isSpellQ ? SPELL_TIME : (mode === 'choice' && difficulty === 'hardcore' ? 10 : CHOICE_TIME)
    if (pauseAtRef.current !== null) {
      deadlineRef.current += Date.now() - pauseAtRef.current
      pauseAtRef.current = null
    } else {
      deadlineRef.current = Date.now() + limit * 1000
      answeredRef.current = false
      setTimeLeft(limit)
    }
    intervalRef.current = window.setInterval(() => {
      activeMsRef.current += 250
      const remain = Math.ceil((deadlineRef.current - Date.now()) / 1000)
      if (remain <= 0) {
        if (intervalRef.current !== null) {
          window.clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setTimeLeft(0)
        handleTimeoutRef.current()
      } else {
        setTimeLeft(remain)
      }
    }, 250)
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [active, index, mode, feedback, difficulty, questions])

  useEffect(() => {
    const q = questions[index]
    const isTextQ = q ? !('options' in q) : (mode === 'spell' || mode === 'polysemy')
    if (isTextQ && !feedback && spellInputRef.current) {
      spellInputRef.current.focus()
    }
  }, [mode, questions, index, feedback])

  useEffect(() => {
    if (!feedback) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat && Date.now() - polySubmitAtRef.current > 800) {
        e.preventDefault()
        if (autoNextRef.current !== null) window.clearTimeout(autoNextRef.current)
        next()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [feedback, next])

  useEffect(() => {
    let active = true
    void (async () => {
      const saved = await loadQuizState()
      if (!active) return
      if (seedStartedRef.current) {
        resumeCheckedRef.current = true
        return
      }
      if (saved) {
        setQuestions(saved.questions)
        setStats(saved.stats)
        setWrongItems(saved.wrongItems)
        setHintedSet(new Set(saved.hinted ?? []))
        setQuizMode(saved.quizMode)
        setQuizLabel(saved.quizLabel)
        setQuizSize(saved.quizSize)
        setQuizRetest(saved.quizRetest ?? (saved.quizLabel === '错题重测' || saved.quizLabel === '错题重默'))
        if (saved.spellDifficulty) setSpellDifficulty(saved.spellDifficulty)
        if (saved.polyDifficulty) setPolyDifficulty(saved.polyDifficulty)
        setPolyInputs(saved.polyInputs ?? [])
        setPolyResults(saved.polyResults ?? [])
        activeMsRef.current = saved.activeMs
        if (saved.feedback) {
          if (saved.index + 1 >= saved.questions.length) {
            setMode('result')
          } else {
            setIndex(saved.index + 1)
            setMode(saved.mode)
          }
        } else {
          setIndex(saved.index)
          setMode(saved.mode)
        }
        setSelected(null)
        setSpellInput('')
        setSpellConfirm(false)
        setFeedback(null)
        answeredRef.current = false
      }
      resumeCheckedRef.current = true
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!resumeCheckedRef.current) return
    if (mode === 'choice' || mode === 'spell' || mode === 'posconv' || mode === 'polysemy' || mode === 'mixed') {
      saveQuizState({
        mode,
        questions,
        index,
        stats,
        wrongItems,
        quizMode,
        quizLabel,
        quizSize,
        quizRetest,
        activeMs: activeMsRef.current,
        feedback,
        hinted: [...hintedSet],
        spellDifficulty,
        polyDifficulty,
        polyInputs,
        polyResults,
      })
    } else if (mode === 'result' || mode === 'menu') {
      clearQuizState()
    }
  }, [mode, questions, index, stats, wrongItems, quizMode, quizLabel, quizSize, quizRetest, feedback, hintedSet, spellDifficulty, polyDifficulty, polyInputs, polyResults])

  useEffect(() => {
    if (quizSeed && quizSeed.words.length > 0) {
      const seed = quizSeed
      seedStartedRef.current = true
      setStarting(true)
      clearQuizSeed()
      if (seed.mode === 'polysemy' && seed.polyRetest && seed.polyRetest.length > 0) {
        const polyQs: PolysemyQuestion[] = []
        for (let i = 0; i < seed.words.length; i++) {
          const w = seed.words[i]
          const p = seed.polyRetest[i]
          if (!w || !p) continue
          polyQs.push({
            kind: 'polysemy',
            word: w,
            meaning: p.meaning,
            answers: p.answerTexts.map((t) => t.toLowerCase()),
            answerTexts: p.answerTexts,
            required: p.required,
            words: [w],
          })
        }
        if (polyQs.length > 0) {
          beginQuiz(polyQs, 'polysemy', '错题重默', true)
        }
        setStarting(false)
        return
      }
      void startQuiz(seed.mode, seed.words, seed.mixedModes, seed.retest, seed.spellDifficulty ?? 'classic', seed.wordSpellDiff).finally(() => setStarting(false))
    }
  }, [quizSeed, startQuiz, clearQuizSeed, beginQuiz])

  const sessionSavedRef = useRef(false)
  useEffect(() => {
    if (mode !== 'result') {
      sessionSavedRef.current = false
      return
    }
    if (sessionSavedRef.current) return
    sessionSavedRef.current = true
    const total = stats.total
    const correct = stats.correct
    if (total === 0) return
    const wrongs: WrongRecord[] = wrongItems.map((w) => ({
      wordId: w.word.id!,
      wordText: w.word.text,
      meaning: wordDisplayMeaning(w.word),
      categoryId: wordFirstCategoryId(w.word) ?? 0,
      correctAnswer: w.correctAns,
      userAnswer: w.userAns,
      mode: w.mode ?? (quizMode === 'mixed' ? 'choice' : quizMode),
      timedOut: w.timedOut,
      spellDifficulty: w.spellDifficulty,
      poly: w.poly,
    }))
    void saveQuizSession({
      date: Date.now(),
      mode: quizMode,
      total,
      correct,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
      label: quizLabel,
      size: total,
      duration: activeMsRef.current,
      wrongs,
      isRetest: quizRetest,
    })
    useDailyGoal.getState().incrementReview(total)
    void useDailyGoal.getState().persist()
    void repoMarkLearnedToday()
  }, [mode, stats, wrongItems, quizMode, quizLabel, quizRetest, saveQuizSession])

  useEffect(() => {
    if (mode !== 'result' || stats.total === 0) return
    const acc = Math.round((stats.correct / stats.total) * 100)
    void speakGrade(acc)
  }, [mode, stats.correct, stats.total])

  const handleChoice = useCallback(
    (choiceIdx: number) => {
      const q = questions[index]
      if (selected !== null || !q || !('options' in q)) return
      answeredRef.current = true
      const qMode = questionMode(q)
      const correct = choiceIdx === q.answer
      setSelected(choiceIdx)
      setFeedback({ correct, correctAns: q.options[q.answer] })
      setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
      markQuizResult(q.word.id!, correct, qMode)
      if (correct) {
        void resolveMistake(q.word.id!, qMode)
      } else {
        setWrongItems((prev) => [...prev, {
          word: q.word,
          correctAns: q.options[q.answer],
          userAns: q.options[choiceIdx],
          timedOut: false,
          mode: qMode,
        }])
        void recordMistake({
          wordId: q.word.id!,
          categoryId: wordFirstCategoryId(q.word) ?? 0,
          userAnswer: q.options[choiceIdx],
          correctAnswer: q.options[q.answer],
          mode: qMode,
          timedOut: false,
        })
      }
      if (autoNextRef.current !== null) window.clearTimeout(autoNextRef.current)
      autoNextRef.current = window.setTimeout(() => next(), correct ? 1000 : 3000)
    },
    [selected, questions, index, markQuizResult, resolveMistake, recordMistake, next],
  )

  const handleSpellSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      const q = questions[index]
      if (feedback || !q || 'options' in q || 'kind' in q) return
      if (!spellConfirm) {
        setSpellConfirm(true)
        return
      }
      setSpellConfirm(false)
      answeredRef.current = true
      const correct = spellInput.trim().toLowerCase() === q.word.text.toLowerCase()
      setFeedback({ correct, correctAns: q.word.text })
      setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
      markQuizResult(q.word.id!, correct, 'spell')
      if (correct) {
        void resolveMistake(q.word.id!, 'spell')
      } else {
        setWrongItems((prev) => [...prev, {
          word: q.word,
          correctAns: q.word.text,
          userAns: spellInput.trim() || '（空）',
          timedOut: false,
          mode: 'spell',
          spellDifficulty: q.hint ? 'easy' : 'classic',
        }])
        void recordMistake({
          wordId: q.word.id!,
          categoryId: wordFirstCategoryId(q.word) ?? 0,
          userAnswer: spellInput.trim() || '（空）',
          correctAnswer: q.word.text,
          mode: 'spell',
          timedOut: false,
          spellDifficulty: q.hint ? 'easy' : 'classic',
        })
      }
      if (autoNextRef.current !== null) window.clearTimeout(autoNextRef.current)
      autoNextRef.current = window.setTimeout(() => next(), correct ? 1000 : 3000)
    },
    [feedback, questions, index, spellConfirm, spellInput, markQuizResult, resolveMistake, recordMistake, next],
  )

  const handlePolySubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      const q = questions[index]
      if (feedback || !q || !('kind' in q) || q.kind !== 'polysemy') return
      const n = q.required
      const inputs = Array.from({ length: n }, (_, i) => {
        const el = polyInputRefs.current[i]
        return (el?.value ?? '').replace(/[^\x20-\x7E]/g, '').trim().toLowerCase()
      })
      const used = new Set<number>()
      const results: (boolean | null)[] = inputs.map((inp) => {
        if (!inp) return false
        const idx = q.answers.findIndex((a, j) => a === inp && !used.has(j))
        if (idx >= 0) {
          used.add(idx)
          return true
        }
        return false
      })
      setPolyResults(results)
      const correctCount = results.filter(Boolean).length
      const correct = correctCount >= q.required
      answeredRef.current = true
      polySubmitAtRef.current = Date.now()
      const correctAns = q.answerTexts.join(' / ')
      const userAns = inputs.filter(Boolean).length > 0 ? inputs.filter(Boolean).join(' / ') : '（空）'
      setFeedback({ correct, correctAns })
      setStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
      for (const w of q.words) markQuizResult(w.id!, correct, 'polysemy')
      if (!correct) {
        setWrongItems((prev) => [...prev, {
          word: q.word,
          correctAns,
          userAns,
          timedOut: false,
          mode: 'polysemy',
          poly: { meaning: q.meaning, answerTexts: q.answerTexts, required: q.required },
        }])
      }
      if (autoNextRef.current !== null) window.clearTimeout(autoNextRef.current)
      autoNextRef.current = window.setTimeout(() => next(), correct ? 1000 : 3000)
    },
    [feedback, questions, index, markQuizResult, next],
  )

  useEffect(() => {
    if (!polyWrongShake) return
    const t = window.setTimeout(() => setPolyWrongShake(false), 500)
    return () => window.clearTimeout(t)
  }, [polyWrongShake])

  useEffect(() => {
    const q = questions[index]
    if (q && 'kind' in q && q.kind === 'polysemy' && !feedback) {
      const n = q.required
      setPolyInputs((prev) => (prev.length === n ? prev : Array(n).fill('')))
      setPolyResults((prev) => (prev.length === n ? prev : Array(n).fill(null)))
    }
  }, [questions, index, feedback])

  useEffect(() => {
    if (mode === 'result' || mode === 'menu') return
    const q = questions[index]
    if (!q || !('options' in q) || selected !== null || feedback) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      let idx = -1
      if (e.key >= 'a' && e.key <= 'z') idx = e.key.charCodeAt(0) - 97
      else if (e.key >= 'A' && e.key <= 'Z') idx = e.key.charCodeAt(0) - 65
      else if (e.key >= '1' && e.key <= '9') idx = Number(e.key) - 1
      if (idx < 0) return
      if (idx < q.options.length) {
        e.preventDefault()
        handleChoice(idx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [questions, index, selected, feedback, handleChoice, mode])

  const progress = useMemo(() => {
    if (questions.length === 0) return 0
    return Math.round(((index + (feedback ? 1 : 0)) / questions.length) * 100)
  }, [index, questions.length, feedback])

  if (starting || (quizSeed && quizSeed.words.length > 0)) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (mode === 'menu') {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )
    }
    if (dbWordCount === 0) {
      return <EmptyState title="还没有单词" description="先导入单词后再来测验吧" actionLabel="去导入" onAction={() => setActiveTab('upload')} />
    }
    const noSelection = selectedCats.size === 0
    const noWordsInSelection = !noSelection && allWords.length === 0
    const canStart = !noSelection && !noWordsInSelection
    return (
      <Page title="开始测验" icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" description="选择题 / 拼写测试 / 一词多译 / 词性转换">
        <div className="card p-4 mb-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">词库类别（可多选）</label>
          <CategoryMultiSelect
            categories={categories}
            selected={selectedCats}
            onChange={setSelectedCats}
            className="w-full"
          />
          <p className="text-xs text-gray-400 mt-2">已选 {selectedCats.size} 类别，含子类共 {allWords.length} 词</p>
          {noSelection && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">请至少选择一个类别</p>
          )}
          {noWordsInSelection && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">所选类别下暂无单词，请选择其他类别</p>
          )}
        </div>

        <div className="card p-4 mb-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2 block">抽题数量</label>
          <div className="flex flex-wrap gap-2">
            {SIZE_PRESETS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setQuizSize(opt.value)}
                className={clsx(
                  'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                  quizSize === opt.value
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                )}
              >
                {opt.label}
              </button>
            ))}
            <div className={clsx('flex items-center gap-1 rounded-xl px-2 transition-colors', quizSize !== 50 && quizSize !== 100 && quizSize !== SIZE_ALL ? 'bg-brand-100 dark:bg-brand-900/40 ring-2 ring-brand-500' : 'bg-gray-100 dark:bg-gray-700')}>
              <input
                type="number"
                min={1}
                value={customSize}
                onChange={(e) => {
                  setCustomSize(e.target.value)
                  const n = parseInt(e.target.value, 10)
                  if (!Number.isNaN(n) && n > 0) setQuizSize(n)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && customSize === '') setQuizSize(50)
                }}
                placeholder="自定义"
                className="w-20 bg-transparent text-center text-sm focus:outline-none py-2"
              />
              <span className="text-xs text-gray-400">题</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            本次将随机抽取 <b className="text-brand-600">{quizSize === SIZE_ALL ? allWords.length : Math.min(quizSize, allWords.length)}</b> 题{quizSize !== SIZE_ALL && quizSize > allWords.length && allWords.length > 0 ? `（词库仅 ${allWords.length} 词，全部使用）` : ''}
          </p>
        </div>
        <div className="grid gap-4">
          <button
            onClick={() => startQuiz('choice')}
            disabled={!canStart}
            className={clsx('card p-6 text-left transition-all', canStart ? 'hover:border-brand-400 hover:shadow-md active:scale-[0.98]' : 'opacity-40 cursor-not-allowed')}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-50">选择题</p>
                <p className="text-xs text-gray-400">{difficulty === 'classic' ? '经典 · 4选项15秒' : '硬核 · 6选项10秒 · 相似干扰'}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setDifficulty('classic')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', difficulty === 'classic' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  经典
                </button>
                <button
                  onClick={() => setDifficulty('hardcore')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', difficulty === 'hardcore' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  硬核
                </button>
              </div>
            </div>
          </button>

          <button
            onClick={() => startQuiz('spell')}
            disabled={!canStart}
            className={clsx('card p-6 text-left transition-all', canStart ? 'hover:border-brand-400 hover:shadow-md active:scale-[0.98]' : 'opacity-40 cursor-not-allowed')}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-50">拼写测试</p>
                <p className="text-xs text-gray-400">{spellDifficulty === 'easy' ? '轻松 · 看释义拼写，带首字母提示' : '经典 · 看释义拼写单词'}</p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setSpellDifficulty('easy')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', spellDifficulty === 'easy' ? 'bg-amber-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  轻松
                </button>
                <button
                  onClick={() => setSpellDifficulty('classic')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', spellDifficulty === 'classic' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  经典
                </button>
              </div>
            </div>
          </button>

          <button
            onClick={() => startQuiz('polysemy')}
            disabled={!canStart || polysemyGroupCount === 0}
            className={clsx('card p-6 text-left transition-all', canStart && polysemyGroupCount > 0 ? 'hover:border-brand-400 hover:shadow-md active:scale-[0.98]' : 'opacity-40 cursor-not-allowed')}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h10M7 16h6M3 8h0M3 12h0M3 16h0" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-50">一词多译</p>
                <p className="text-xs text-gray-400">
                  {canStart && polysemyGroupCount === 0
                    ? '所选词库暂无一词多译条件（需至少 2 个词共用同一释义）'
                    : `${polyDifficulty === 'easy' ? '轻松 · 写对 1 个' : polyDifficulty === 'classic' ? '经典 · 写对 2 个' : '硬核 · 写对 3 个'}（相同释义多词${polysemyGroupCount > 0 ? `，共 ${polysemyGroupCount} 组` : ''}）`}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setPolyDifficulty('easy')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', polyDifficulty === 'easy' ? 'bg-teal-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  轻松
                </button>
                <button
                  onClick={() => setPolyDifficulty('classic')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', polyDifficulty === 'classic' ? 'bg-brand-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  经典
                </button>
                <button
                  onClick={() => setPolyDifficulty('hardcore')}
                  className={clsx('rounded-lg px-2.5 py-1 text-xs font-medium transition-colors', polyDifficulty === 'hardcore' ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400')}
                >
                  硬核
                </button>
              </div>
            </div>
          </button>

          <button
            onClick={() => startQuiz('posconv')}
            disabled={!canStart}
            className={clsx('card p-6 text-left transition-all', canStart ? 'hover:border-brand-400 hover:shadow-md active:scale-[0.98]' : 'opacity-40 cursor-not-allowed')}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 5h8m-8 5h8M3 5h2M3 12h2M3 19h2" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-50">词性转换</p>
                <p className="text-xs text-gray-400">根据词根选择对应词性形式</p>
              </div>
            </div>
          </button>
        </div>
      </Page>
    )
  }

  if (mode === 'result') {
    const total = stats.total
    const correct = stats.correct
    const wrong = total - correct
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
    const modeLabel = quizRetest ? '错题重默' : quizMode === 'choice' ? '选择题' : quizMode === 'spell' ? (spellDifficulty === 'easy' ? '拼写测试·轻松' : '拼写测试') : quizMode === 'polysemy' ? `一词多译·${polyDifficulty === 'easy' ? '轻松' : polyDifficulty === 'classic' ? '经典' : '硬核'}` : '词性转换'
    const grade = gradeOf(accuracy)
    const resultTotalPages = Math.max(1, Math.ceil(wrongItems.length / RESULT_PAGE_SIZE))
    const resultCurrentPage = Math.min(page, resultTotalPages)
    const pagedWrong = wrongItems.slice((resultCurrentPage - 1) * RESULT_PAGE_SIZE, resultCurrentPage * RESULT_PAGE_SIZE)
    return (
      <Page className="max-w-2xl">
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <span className="text-[10rem] sm:text-[13rem] leading-none drop-shadow-2xl animate-grade-pop select-none">
            {grade.emoji}
          </span>
        </div>
        <div className="text-center mb-6">
          <div
            className="text-6xl font-black italic mb-2 animate-slide-up tracking-wider"
            style={{
              background: grade.gradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: grade.shadow,
            }}
          >
            {grade.text}
          </div>
          <div className={clsx('inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3', grade.box)}>
            <span className="text-2xl">{grade.emoji}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">测验完成</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{modeLabel} · 共 {total} 题</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{correct}</p>
            <p className="text-xs text-gray-400 mt-1">正确</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{wrong}</p>
            <p className="text-xs text-gray-400 mt-1">错误</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{accuracy}%</p>
            <p className="text-xs text-gray-400 mt-1">正确率</p>
          </div>
        </div>

        {(quizMode === 'spell' || quizMode === 'mixed') && (
          <p className="text-center text-xs text-gray-400 mb-6">
            发音提示：{hintedSet.size} 次（占 {spellTotal > 0 ? Math.round((hintedSet.size / spellTotal) * 100) : 0}%，上限 {maxHints} 次）
          </p>
        )}

        {wrongItems.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">错题列表（{wrongItems.length}）</h2>
              <button
                onClick={async () => {
                  for (const w of wrongItems) {
                    await speak(w.word.text)
                  }
                }}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                全部朗读
              </button>
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {pagedWrong.map((item, i) => (
                <div key={item.word.id ?? i} className="card p-3 animate-slide-up">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-gray-900 dark:text-gray-50">{item.word.text}</span>
                      {wordPhonetic(item.word) && (
                        <span className="text-xs text-gray-400">/{wordPhonetic(item.word)}/</span>
                      )}
                      <button
                        onClick={() => speak(item.word.text)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
                        </svg>
                      </button>
                    </div>
                    {item.timedOut && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">超时</span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400">释义：</span>{wordDisplayMeaning(item.word) || '（无）'}
                    </p>
                    <p className="text-green-600 dark:text-green-400">
                      <span className="text-gray-400">正确答案：</span>
                      <b>{item.correctAns}</b>
                    </p>
                    <p className="text-red-500 dark:text-red-400">
                      <span className="text-gray-400">你的回答：</span>{item.userAns}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {resultTotalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
                <button onClick={() => setPage(1)} disabled={resultCurrentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', resultCurrentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="首页">«</button>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={resultCurrentPage <= 1} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', resultCurrentPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                {(() => {
                  const btns: React.ReactNode[] = []
                  const start = Math.max(1, resultCurrentPage - 2)
                  const end = Math.min(resultTotalPages, resultCurrentPage + 2)
                  if (start > 1) btns.push(<span key="e1" className="text-gray-400 px-1">…</span>)
                  for (let i = start; i <= end; i++) {
                    btns.push(<button key={i} onClick={() => setPage(i)} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors', i === resultCurrentPage ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>{i}</button>)
                  }
                  if (end < resultTotalPages) btns.push(<span key="e2" className="text-gray-400 px-1">…</span>)
                  return btns
                })()}
                <button onClick={() => setPage((p) => Math.min(resultTotalPages, p + 1))} disabled={resultCurrentPage >= resultTotalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors', resultCurrentPage >= resultTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
                <button onClick={() => setPage(resultTotalPages)} disabled={resultCurrentPage >= resultTotalPages} className={clsx('w-9 h-9 rounded-lg flex items-center justify-center transition-colors text-xs', resultCurrentPage >= resultTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700')} title="末页">»</button>
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-gray-400">跳至</span>
                  <input type="number" min={1} max={resultTotalPages} value={pageInput} onChange={(e) => setPageInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const n = parseInt(pageInput, 10); if (!Number.isNaN(n) && n >= 1 && n <= resultTotalPages) setPage(n); setPageInput('') } }} placeholder={String(resultCurrentPage)} className="w-12 text-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  <span className="text-xs text-gray-400">页</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {wrongItems.length > 0 && (
            <button
              onClick={() => {
                if (quizMode === 'polysemy') {
                  const polyQs: PolysemyQuestion[] = wrongItems
                    .filter((w) => w.poly)
                    .map((w) => ({
                      kind: 'polysemy' as const,
                      word: w.word,
                      meaning: w.poly!.meaning,
                      answers: w.poly!.answerTexts.map((t) => t.toLowerCase()),
                      answerTexts: w.poly!.answerTexts,
                      required: w.poly!.required,
                      words: [w.word],
                    }))
                  if (polyQs.length === 0) return
                  beginQuiz(polyQs, 'polysemy', '错题重默', true)
                  return
                }
                const wsDiff: Record<number, 'easy' | 'classic'> = {}
                for (const w of wrongItems) {
                  if (w.spellDifficulty && w.word.id != null) wsDiff[w.word.id] = w.spellDifficulty
                }
                if (quizMode === 'mixed') {
                  void startQuiz('mixed', wrongItems.map((w) => w.word), wrongItems.map((w) => w.mode), true, undefined, wsDiff)
                } else {
                  void startQuiz(quizMode, wrongItems.map((w) => w.word), undefined, true, undefined, wsDiff)
                }
              }}
              className="btn-primary w-full"
            >
              重新测试错题（{wrongItems.length} 词）
            </button>
          )}
          <button onClick={() => setMode('menu')} className="btn-secondary w-full">
            返回菜单
          </button>
        </div>
      </Page>
    )
  }

  const curQ = questions[index]
  if (curQ && 'options' in curQ) {
    const q = curQ
    return (
      <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
        <div className="flex justify-end mb-1">
          <button onClick={endQuiz} className="text-xs text-gray-400 hover:text-red-500">结束测验</button>
        </div>
        <ProgressBar value={progress} index={index} total={questions.length} correct={stats.correct} />
        <TimerBar timeLeft={timeLeft} limit={mode === 'choice' && difficulty === 'hardcore' ? 10 : CHOICE_TIME} />
        <div className="card p-6 mb-4 text-center">
          <p className="text-xs text-gray-400 mb-2">
            {q.type === 'word-to-meaning' ? '选择正确的释义' : q.type === 'meaning-to-word' ? '选择正确的单词' : '选择正确的词形'}
          </p>
          <div className="flex items-center justify-center gap-2">
            {q.type === 'posconv' ? (
              <p className="text-lg font-medium text-gray-700 dark:text-gray-200">{q.prompt}</p>
            ) : q.type === 'meaning-to-word' ? (
              <p className="text-lg text-gray-700 dark:text-gray-200">{wordDisplayMeaning(q.word)}</p>
            ) : (
              <>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{q.word.text}</p>
                <button onClick={() => speak(q.word.text)} className="w-9 h-9 rounded-full flex items-center justify-center text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
                  </svg>
                </button>
              </>
            )}
          </div>
          {q.type === 'meaning-to-word' && wordPhonetic(q.word) && (
            <p className="text-xs text-gray-400 mt-1">/{wordPhonetic(q.word)}/</p>
          )}
        </div>

        <div className="grid gap-2">
          {q.options.map((opt, i) => {
            const isAnswer = i === q.answer
            const isPicked = selected === i
            const letter = String.fromCharCode(65 + i)
            return (
              <button
                key={i}
                disabled={selected !== null}
                onClick={() => handleChoice(i)}
                className={clsx(
                  'rounded-xl border-2 px-4 py-3 text-left text-sm transition-all flex items-center gap-2',
                  selected === null
                    ? 'border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20'
                    : isAnswer
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : isPicked
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300'
                        : 'border-gray-200 dark:border-gray-700 opacity-50',
                )}
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">{letter}</span>
                <span className="flex-1">{opt}</span>
              </button>
            )
          })}
        </div>

        {feedback && <FeedbackBar correct={feedback.correct} correctAns={feedback.correctAns} timedOut={feedback.timedOut} onNext={next} />}
      </div>
    )
  }

  // polysemy mode
  if (curQ && 'kind' in curQ && curQ.kind === 'polysemy') {
    const pq = curQ
    const n = pq.required
    const boxes = polyInputs.length === n ? polyInputs : Array(n).fill('')
    return (
      <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
        <div className="flex justify-end mb-1">
          <button onClick={endQuiz} className="text-xs text-gray-400 hover:text-red-500">结束测验</button>
        </div>
        <ProgressBar value={progress} index={index} total={questions.length} correct={stats.correct} />
        <TimerBar timeLeft={timeLeft} limit={POLY_TIME} />
        <div className="card p-6 mb-4 text-center">
          <p className="text-xs text-gray-400 mb-2">
            一词多译 · 请写出 <b className="text-teal-600">{n}</b> 个英文（共 {pq.answerTexts.length} 个答案）
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">{pq.meaning}</p>
        </div>

        <div key={index} className="space-y-2">
            {boxes.map((val, i) => {
              const res = polyResults.length === n ? polyResults[i] : null
              return (
                <div key={i} className="flex gap-2 items-center">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">{i + 1}</span>
                  <input
                    ref={(el: HTMLInputElement | null) => { polyInputRefs.current[i] = el; if (i === 0) spellInputRef.current = el }}
                    type="text"
                    value={val}
                    disabled={!!feedback}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (i < n - 1) {
                          polyInputRefs.current[i + 1]?.focus()
                        } else {
                          handlePolySubmit()
                        }
                      }
                    }}
                    onBeforeInput={(e) => {
                      const native = e.nativeEvent as unknown as { inputType?: string; data?: string | null }
                      if (native.inputType?.startsWith('insert') && native.data && native.data.length > 1) {
                        e.preventDefault()
                      }
                    }}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\x20-\x7E]/g, '')
                      setPolyInputs((prev) => {
                        const arr = prev.length === n ? [...prev] : Array(n).fill('')
                        arr[i] = v
                        return arr
                      })
                      setPolyResults((prev) => {
                        const arr = prev.length === n ? [...prev] : Array(n).fill(null)
                        arr[i] = null
                        return arr
                      })
                    }}
                    onCompositionStart={(e) => {
                      setImeComposing(true)
                      e.currentTarget.blur()
                    }}
                    onCompositionEnd={(e) => {
                      setImeComposing(false)
                      const v = e.currentTarget.value.replace(/[^\x20-\x7E]/g, '')
                      setPolyInputs((prev) => {
                        const arr = prev.length === n ? [...prev] : Array(n).fill('')
                        arr[i] = v
                        return arr
                      })
                    }}
                    onFocus={() => { setSpellFocused(true); setImeComposing(false) }}
                    onBlur={() => setSpellFocused(false)}
                    autoFocus={i === 0}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    inputMode="text"
                    name={`poly-answer-${i}`}
                    aria-label={`一词多译输入 ${i + 1}`}
                    lang="en"
                    placeholder={`英文 ${i + 1}`}
                    className={clsx(
                      'flex-1 rounded-xl border-2 px-4 py-3 text-sm min-h-[44px] transition-colors outline-none text-gray-900 dark:text-gray-50',
                      res === true
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : res === false
                          ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800',
                    )}
                  />
                  {res === true && (
                    <span className="flex-shrink-0 text-green-600 text-sm font-bold">✓</span>
                  )}
                </div>
              )
            })}
            {!feedback && <button type="button" onClick={() => handlePolySubmit()} className="btn-primary w-full mt-2">提交</button>}
          </div>

        {imeComposing && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 animate-slide-up">
            已拦截中文输入法联想。请按 Shift 切换到英文输入法，然后点击输入框继续
          </p>
        )}

        {feedback && <FeedbackBar correct={feedback.correct} correctAns={feedback.correctAns} timedOut={feedback.timedOut} onNext={next} />}
      </div>
    )
  }

  // spell mode
  const sq = curQ as SpellQuestion | undefined
  if (!sq) return null
  return (
    <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-fade-in">
      <div className="flex justify-end mb-1">
        <button onClick={endQuiz} className="text-xs text-gray-400 hover:text-red-500">结束测验</button>
      </div>
      <ProgressBar value={progress} index={index} total={questions.length} correct={stats.correct} />
      <TimerBar timeLeft={timeLeft} limit={SPELL_TIME} />
      <div className="card p-6 mb-4 text-center">
        <p className="text-xs text-gray-400 mb-2">请拼写下面的{sq.word.text.trim().split(/\s+/).length > 1 ? '词组' : '单词'}</p>
        <p className="text-lg text-gray-700 dark:text-gray-200">{wordDisplayMeaning(sq.word)}</p>
        {wordPhonetic(sq.word) && (
          <p className="text-xs text-gray-400 mt-1">/{wordPhonetic(sq.word)}/</p>
        )}
        {sq.hint && !feedback && (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            首字母提示：<span className="font-mono font-bold text-lg">{sq.hint}</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSpellSubmit} className="flex gap-2" autoComplete="off">
        <input
          ref={spellInputRef}
          type="text"
          value={spellInput}
          onBeforeInput={(e) => {
            const native = e.nativeEvent as unknown as { inputType?: string; data?: string | null }
            if (native.inputType?.startsWith('insert') && native.data && native.data.length > 1) {
              e.preventDefault()
            }
          }}
          onChange={(e) => {
            setSpellInput(e.target.value.replace(/[^\x20-\x7E]/g, ''))
            setSpellConfirm(false)
          }}
          onCompositionStart={(e) => {
            setImeComposing(true)
            e.currentTarget.blur()
          }}
          onCompositionEnd={(e) => {
            setSpellInput(e.currentTarget.value.replace(/[^\x20-\x7E]/g, ''))
            setSpellConfirm(false)
          }}
          onFocus={() => { setSpellFocused(true); setImeComposing(false) }}
          onBlur={() => setSpellFocused(false)}
          disabled={!!feedback}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="text"
          name="spell-answer-quiz"
          aria-label="拼写输入"
          lang="en"
          placeholder="请切换到英文输入法后拼写..."
          className={clsx(
            'flex-1 rounded-xl border-2 px-4 py-3 text-sm min-h-[44px] transition-colors outline-none text-gray-900 dark:text-gray-50',
            imeComposing
              ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
              : spellFocused
                ? 'border-brand-500 bg-white dark:bg-gray-800'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800',
          )}
        />
        {!feedback ? (
          <>
            <button
              type="button"
              onClick={() => {
                speak(sq.word.text)
                if (!hintedSet.has(index)) setHintedSet((prev) => new Set(prev).add(index))
              }}
              disabled={hintedSet.size >= maxHints && !hintedSet.has(index)}
              title="听单词发音（本次测验最多 20% 拼写题可使用）"
              className="btn-secondary whitespace-nowrap flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
              </svg>
              提示
              <span className="text-[10px] text-gray-400">{Math.max(0, maxHints - hintedSet.size)}/{maxHints}</span>
            </button>
            <button type="submit" disabled={imeComposing} className="btn-primary">{spellConfirm ? '确定提交' : '提交'}</button>
          </>
        ) : (
          <button type="button" onClick={() => speak(sq.word.text)} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 010 7m-3-9l-4 4H3v6h5.5l4 4v-14z" />
            </svg>
          </button>
        )}
      </form>

      {imeComposing && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 animate-slide-up">
          已拦截中文输入法联想。请按 Shift 切换到英文输入法，然后点击输入框继续拼写（中文候选不会进入答案）
        </p>
      )}

      {spellConfirm && !feedback && (
        <div className="mt-3 rounded-xl p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm animate-slide-up flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">确定提交拼写「{spellInput.trim() || '（空）'}」吗？</span>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => { setSpellConfirm(false); spellInputRef.current?.focus() }}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              再想想
            </button>
            <button type="button" onClick={() => handleSpellSubmit()} className="btn-primary text-xs px-3 py-1.5">
              确定提交
            </button>
          </div>
        </div>
      )}

      {feedback && <FeedbackBar correct={feedback.correct} correctAns={feedback.correctAns} timedOut={feedback.timedOut} onNext={next} />}
    </div>
  )
}

function TimerBar({ timeLeft, limit }: { timeLeft: number; limit: number }) {
  const pct = Math.max(0, (timeLeft / limit) * 100)
  const flashing = timeLeft > 0 && timeLeft <= 5
  const color = timeLeft <= 3 ? 'bg-red-500' : timeLeft <= 6 ? 'bg-amber-500' : 'bg-blue-500'
  const textColor = timeLeft <= 5 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'
  return (
    <div className={clsx('flex items-center gap-2 mb-3', flashing && 'flash-shake')}>
      <svg className={clsx('w-4 h-4', textColor)} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className={clsx('text-sm font-mono font-bold tabular-nums', textColor)}>{timeLeft}s</span>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={clsx('h-full transition-all duration-300', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ProgressBar({ value, index, total, correct }: { value: number; index: number; total: number; correct: number }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
        <span>{index + 1} / {total}</span>
        <span>正确 {correct}</span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

function FeedbackBar({ correct, correctAns, timedOut, onNext }: { correct: boolean; correctAns: string; timedOut?: boolean; onNext: () => void }) {
  return (
    <div className={clsx('mt-4 rounded-xl p-3 text-sm animate-slide-up flex items-center justify-between', correct ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300')}>
      <span>
        {correct ? '✓ 正确!' : timedOut ? `⏱ 超时! 正确答案: ${correctAns}` : `✗ 正确答案: ${correctAns}`}
      </span>
      <button onClick={onNext} className="btn-primary text-xs px-3 py-1.5">下一题</button>
    </div>
  )
}
