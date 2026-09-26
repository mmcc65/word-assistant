import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { mergeAppData } from '../domain/merge'
import type { AppData, SyncPayload } from '../domain/types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isSyncConfigured = Boolean(url && key)
export const supabase: SupabaseClient | null = isSyncConfigured ? createClient(url!, key!) : null

function deviceId(): string {
  const storageKey = 'cet6-device-id'
  let id = localStorage.getItem(storageKey)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(storageKey, id)
  }
  return id
}

export async function currentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('尚未配置 Supabase。')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email: string, password: string): Promise<void> {
  if (!supabase) throw new Error('尚未配置 Supabase。')
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function syncData(local: AppData): Promise<AppData> {
  if (!supabase) throw new Error('未配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY。')
  const user = await currentUser()
  if (!user) throw new Error('请先登录后再同步。')
  const { data: row, error: readError } = await supabase.from('user_snapshots').select('payload').eq('user_id', user.id).maybeSingle()
  if (readError) throw readError
  const remote = row?.payload ? (row.payload as SyncPayload).data : null
  const merged = remote ? mergeAppData(local, remote) : local
  const payload: SyncPayload = { schemaVersion: merged.schemaVersion, data: merged, deviceId: deviceId(), updatedAt: new Date().toISOString() }
  const { error: writeError } = await supabase.from('user_snapshots').upsert({ user_id: user.id, payload, updated_at: payload.updatedAt }, { onConflict: 'user_id' })
  if (writeError) throw writeError
  return { ...merged, dirty: false, settings: { ...merged.settings, lastSyncAt: payload.updatedAt }, updatedAt: payload.updatedAt }
}
