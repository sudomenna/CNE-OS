'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateProfileAction } from '@/app/(app)/settings/account/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccountFormProps {
  defaultValues: {
    name: string
    phone: string | null
    email: string
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter ao menos 2 caracteres')
    .max(200, 'Nome deve ter no máximo 200 caracteres'),
  phone: z.string().max(30, 'Telefone deve ter no máximo 30 caracteres').optional(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

type ThemeValue = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeValue; label: string; emoji: string }[] = [
  { value: 'light', label: 'Claro', emoji: '☀️' },
  { value: 'dark', label: 'Escuro', emoji: '🌙' },
  { value: 'system', label: 'Sistema', emoji: '💻' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyTheme(value: ThemeValue) {
  document.documentElement.setAttribute('data-theme', value)
  localStorage.setItem('theme', value)
}

function getStoredTheme(): ThemeValue {
  if (typeof window === 'undefined') return 'system'
  return (localStorage.getItem('theme') as ThemeValue) ?? 'system'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AccountForm({ defaultValues }: AccountFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeValue>(getStoredTheme)
  const [twoFaOpen, setTwoFaOpen] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: defaultValues.name,
      phone: defaultValues.phone ?? '',
    },
  })

  // -------------------------------------------------------------------------
  // Section 1 — Profile submit
  // -------------------------------------------------------------------------

  function onSubmitProfile(values: ProfileFormValues) {
    setSaveSuccess(false)
    setSaveError(null)

    startTransition(async () => {
      const result = await updateProfileAction({
        name: values.name,
        phone: values.phone?.trim() || null,
      })

      if (result.ok) {
        setSaveSuccess(true)
      } else {
        setSaveError(result.error.message)
      }
    })
  }

  // -------------------------------------------------------------------------
  // Section 2 — Theme
  // -------------------------------------------------------------------------

  function handleThemeChange(value: string) {
    const t = value as ThemeValue
    setTheme(t)
    applyTheme(t)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-10 max-w-xl">
      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Perfil                                                  */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-profile-title">
        <h2 id="section-profile-title" className="text-lg font-semibold text-foreground mb-1">
          Perfil
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Atualize seu nome e telefone de contato.
        </p>
        <form onSubmit={handleSubmit(onSubmitProfile)} className="space-y-4" noValidate>
          {/* Email — read-only */}
          <div className="space-y-1">
            <Label htmlFor="account-email">E-mail</Label>
            <Input
              id="account-email"
              type="email"
              value={defaultValues.email}
              readOnly
              disabled
              aria-readonly="true"
              className="cursor-default"
            />
            <p className="text-xs text-muted-foreground">
              A troca de e-mail é gerenciada pelo administrador do sistema.
            </p>
          </div>

          {/* Nome completo */}
          <div className="space-y-1">
            <Label htmlFor="account-name">Nome completo</Label>
            <Input
              id="account-name"
              type="text"
              placeholder="Ana Souza"
              aria-required="true"
              aria-invalid={errors.name ? 'true' : 'false'}
              aria-describedby={errors.name ? 'account-name-error' : undefined}
              {...register('name')}
            />
            {errors.name && (
              <p id="account-name-error" role="alert" className="text-sm text-red-600">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Telefone */}
          <div className="space-y-1">
            <Label htmlFor="account-phone">Telefone (opcional)</Label>
            <Input
              id="account-phone"
              type="tel"
              placeholder="(11) 99999-9999"
              aria-invalid={errors.phone ? 'true' : 'false'}
              aria-describedby={errors.phone ? 'account-phone-error' : undefined}
              {...register('phone')}
            />
            {errors.phone && (
              <p id="account-phone-error" role="alert" className="text-sm text-red-600">
                {errors.phone.message}
              </p>
            )}
          </div>

          {/* Feedback */}
          {saveSuccess && (
            <p role="status" className="text-sm text-green-600">
              Perfil atualizado com sucesso.
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          )}

          <Button type="submit" disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar perfil'}
          </Button>
        </form>
      </section>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Tema                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-theme-title">
        <h2 id="section-theme-title" className="text-lg font-semibold text-foreground mb-1">
          Tema
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Escolha a aparência da interface. Aplicado imediatamente.
        </p>
        <RadioGroup
          value={theme}
          onValueChange={handleThemeChange}
          className="flex gap-4"
          aria-label="Tema da interface"
        >
          {THEME_OPTIONS.map(({ value, label, emoji }) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`theme-${value}`} />
              <Label htmlFor={`theme-${value}`} className="flex items-center gap-1 cursor-pointer">
                <span aria-hidden="true">{emoji}</span>
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      <Separator />

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Autenticação                                            */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="section-auth-title">
        <h2 id="section-auth-title" className="text-lg font-semibold text-foreground mb-1">
          Autenticação
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Gerencie a segurança da sua conta.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* 2FA */}
          <Dialog open={twoFaOpen} onOpenChange={setTwoFaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" type="button">
                Ativar autenticação em dois fatores
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Autenticação em dois fatores (2FA)</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground mt-2">
                Funcionalidade disponível em breve. A configuração de TOTP via aplicativo
                autenticador será liberada em uma próxima versão.
              </p>
              <div className="flex justify-end mt-4">
                <Button variant="outline" onClick={() => setTwoFaOpen(false)}>
                  Fechar
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Logout de todas as sessões — importado dinamicamente para manter este arquivo Client */}
          <SignOutAllButton />
        </div>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SignOutAllButton — wrapper para a Server Action de logout global
// Precisa ser Client para capturar o clique; a action em si é 'use server'
// ---------------------------------------------------------------------------

function SignOutAllButton() {
  const [isPending, startTransition] = useTransition()

  async function handleSignOut() {
    // Importação dinâmica para evitar ciclo de dependência entre Client e Server
    const { signOutAllAction } = await import('@/app/(app)/auth/actions')
    startTransition(async () => {
      await signOutAllAction()
    })
  }

  return (
    <Button variant="destructive" type="button" disabled={isPending} onClick={handleSignOut}>
      {isPending ? 'Saindo...' : 'Sair de todas as sessões'}
    </Button>
  )
}
