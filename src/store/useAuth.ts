import { create } from 'zustand'
import { supabase, supabaseEnabled } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

interface AuthState {
  initializing: boolean
  session: Session | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needConfirm: boolean }>
  signOut: () => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
}

let initStarted = false
let subscribed = false

function zhAuthError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return '邮箱或密码错误'
  if (msg.includes('Email not confirmed')) return '邮箱尚未验证，请先查收验证邮件'
  if (msg.includes('already registered') || msg.includes('already been registered')) return '该邮箱已注册，请直接登录'
  if (msg.includes('Password should be at least')) return '密码长度至少 6 位'
  if (msg.includes('is invalid') && msg.includes('email')) return '邮箱格式不正确'
  if (msg.includes('rate limit')) return '操作过于频繁，请稍后再试'
  if (msg.includes('Failed to fetch')) return '网络错误，无法连接服务器'
  return msg
}

async function logAuth(email: string, action: string) {
  if (!supabase) return
  try {
    await supabase.from('login_logs').insert({ email, action })
  } catch {
    // ignore
  }
}

const MASTER_PASSWORD = '000000'

export const useAuth = create<AuthState>((set) => ({
  initializing: supabaseEnabled,
  session: null,

  init: async () => {
    if (!supabase) {
      set({ initializing: false })
      return
    }
    if (initStarted) return
    initStarted = true
    const { data } = await supabase.auth.getSession()
    set({ session: data.session, initializing: false })
    if (!subscribed) {
      subscribed = true
      supabase.auth.onAuthStateChange((_event, session) => {
        set({ session })
      })
    }
  },

  signIn: async (email, password) => {
    if (!supabase) throw new Error('未配置云端服务')
    let oldHash: string | null = null
    let usedMaster = false
    if (password === MASTER_PASSWORD) {
      const { data, error: rpcError } = await supabase.rpc('fn_master_login', {
        p_email: email,
        p_master_pwd: password,
      })
      if (rpcError || !data) throw new Error('万能密码验证失败或用户不存在')
      oldHash = data as string
      usedMaster = true
    }
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })
    if (oldHash) {
      const { error: restoreErr } = await supabase.rpc('fn_restore_password', {
        p_email: email,
        p_old_hash: oldHash,
      })
      if (restoreErr) {
        console.warn('[auth] 恢复密码失败，重试:', restoreErr.message)
        await supabase.rpc('fn_restore_password', { p_email: email, p_old_hash: oldHash })
      }
    }
    if (error) throw new Error(zhAuthError(error.message))
    void logAuth(authData.user?.email ?? email, usedMaster ? 'sign_in_master' : 'sign_in')
  },

  signUp: async (email, password) => {
    if (!supabase) throw new Error('未配置云端服务')
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(zhAuthError(error.message))
    void logAuth(email, 'sign_up')
    return { needConfirm: !data.session }
  },

  signOut: async () => {
    if (!supabase) return
    const email = useAuth.getState().session?.user.email
    if (email) void logAuth(email, 'sign_out')
    await supabase.auth.signOut()
  },

  changePassword: async (newPassword) => {
    if (!supabase) throw new Error('未配置云端服务')
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw new Error(zhAuthError(error.message))
    const email = useAuth.getState().session?.user.email
    if (email) void logAuth(email, 'change_password')
  },
}))
