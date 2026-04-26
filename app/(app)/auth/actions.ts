'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/auth/supabase-server'

/**
 * Encerra a sessão corrente e redireciona para /login.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login')
}

/**
 * Encerra todas as sessões ativas do usuário (scope global) e redireciona para /login.
 */
export async function signOutAllAction(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'global' })
  redirect('/login')
}

/**
 * Encerra a sessão de impersonação removendo o cookie cne_impersonating.
 * O cliente chama router.refresh() após esta action.
 */
export async function stopImpersonationAction(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('cne_impersonating')
}
