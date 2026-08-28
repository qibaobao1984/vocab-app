let cachedVoices: SpeechSynthesisVoice[] = []

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve([])
      return
    }
    const synth = window.speechSynthesis
    const existing = synth.getVoices()
    if (existing.length > 0) {
      cachedVoices = existing
      resolve(existing)
      return
    }
    const handler = () => {
      cachedVoices = synth.getVoices()
      resolve(cachedVoices)
    }
    synth.addEventListener('voiceschanged', handler, { once: true })
    setTimeout(() => resolve(synth.getVoices()), 1000)
  })
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const prefix = lang.toLowerCase().split('-')[0]
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix))
  if (prefix === 'en') {
    const us = matches.find((v) => v.lang.toLowerCase().includes('en-us'))
    return us ?? matches[0]
  }
  const cn = matches.find((v) => /zh[-_]?cn/i.test(v.lang) || /zh[-_]?hans/i.test(v.lang))
  return cn ?? matches[0]
}

const ZH_NEURAL_KEYWORDS = ['Neural', 'Wavenet', 'Siri', 'Xiaoxiao', 'Yunjian', 'Natural']

function isZhCnVoice(v: SpeechSynthesisVoice): boolean {
  return /zh[-_]?cn/i.test(v.lang) || /zh[-_]?hans/i.test(v.lang)
}

function pickZhCnNeuralVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const zh = voices.filter(isZhCnVoice)
  if (zh.length === 0) return undefined
  for (const kw of ZH_NEURAL_KEYWORDS) {
    const lower = kw.toLowerCase()
    const hit = zh.find((v) => v.name.toLowerCase().includes(lower))
    if (hit) return hit
  }
  return zh[0]
}

function playAudio(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      resolve(ok)
    }
    try {
      const audio = new Audio(url)
      audio.onended = () => finish(true)
      audio.onerror = () => finish(false)
      audio.play().then(() => { /* playing */ }).catch(() => finish(false))
      setTimeout(() => finish(false), 6000)
    } catch {
      finish(false)
    }
  })
}

function speakViaWebSpeech(text: string, lang: string, rate: number) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (!cachedVoices.length) loadVoices()
  const synth = window.speechSynthesis
  try {
    if (synth.speaking || synth.pending) synth.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate
    const voice = pickVoice(cachedVoices, lang)
    if (voice) utter.voice = voice
    synth.speak(utter)
    synth.resume()
  } catch {
    /* ignore */
  }
}

export async function speak(text: string, lang = 'en-US', rate = 0.9): Promise<void> {
  if (typeof window === 'undefined') return
  const trimmed = text.trim()
  if (!trimmed) return
  if (lang.toLowerCase().startsWith('en') && !/\s/.test(trimmed)) {
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(trimmed)}&type=2`
    const ok = await playAudio(url)
    if (ok) return
  }
  speakViaWebSpeech(trimmed, lang, rate)
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

interface GradeVoice {
  phrases: string[]
  rate: number
  pitch: number
}

function gradeVoiceFor(score: number): GradeVoice {
  if (score >= 95) return { phrases: ['夯爆了！词汇之神！', '神挡杀神！你就是词汇之王！', '满分气场！请收下我的膝盖！'], rate: 1.4, pitch: 1.6 }
  if (score >= 90) return { phrases: ['顶级！太强了！', '稳如老狗！这波顶级！', '大佬请收下我的崇拜！'], rate: 1.3, pitch: 1.5 }
  if (score >= 80) return { phrases: ['人上人！不错嘛。', '这水平，已经是人上人了。', '相当能打，继续保持！'], rate: 1.2, pitch: 1.4 }
  if (score >= 60) return { phrases: ['NPC。平平无奇。', '勉强及格，别飘。', '路人甲水平，再加把劲。'], rate: 0.9, pitch: 1.0 }
  return { phrases: ['拉完了～就这？', '就这？就这？就这？', '建议重开，真的。'], rate: 0.5, pitch: 0.4 }
}

export async function speakGrade(score: number): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  await loadVoices()
  const synth = window.speechSynthesis
  const { phrases, rate, pitch } = gradeVoiceFor(score)
  const text = phrases[Math.floor(Math.random() * phrases.length)]
  try {
    if (synth.speaking || synth.pending) synth.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'
    utter.rate = rate
    utter.pitch = pitch
    const voice = pickZhCnNeuralVoice(cachedVoices)
    if (voice) utter.voice = voice
    synth.speak(utter)
    synth.resume()
  } catch {
    /* ignore */
  }
}

export function ttsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis
}

export function preloadVoices(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    loadVoices()
  }
}
