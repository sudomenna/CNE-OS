import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userAccount } from '@/lib/db/schema/organization'
import { createSupabaseServerClient } from '@/lib/auth/supabase-server'
import { AccountForm } from '@/components/settings/account-form'
import { redirect } from 'next/navigation'

export const metadata = {
  title: 'Minha conta — Configurações',
}

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const rows = await db
    .select({
      id: userAccount.id,
      email: userAccount.email,
      fullName: userAccount.fullName,
      phone: userAccount.phone,
    })
    .from(userAccount)
    .where(eq(userAccount.id, user.id))
    .limit(1)

  const account = rows[0]

  if (!account) {
    redirect('/login')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Minha conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seu perfil, tema e configurações de segurança.
        </p>
      </div>
      <AccountForm
        defaultValues={{
          name: account.fullName,
          phone: account.phone,
          email: account.email,
        }}
      />
    </div>
  )
}
