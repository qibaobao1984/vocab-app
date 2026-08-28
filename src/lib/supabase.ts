import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseEnabled = Boolean(url && anonKey)

const RETRY_ATTEMPTS = 2
const RETRY_DELAY = 600

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.status < 500 || attempt >= RETRY_ATTEMPTS) return res
      await sleep(RETRY_DELAY)
    } catch (e) {
      if ((e instanceof DOMException && e.name === 'AbortError') || attempt >= RETRY_ATTEMPTS) throw e
      await sleep(RETRY_DELAY)
    }
  }
}

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, anonKey!, { global: { fetch: fetchWithRetry } })
  : null
