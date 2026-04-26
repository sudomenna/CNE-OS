'use client'

/**
 * MessageComposer — compositor de mensagens com 3 tabs:
 *   • Mensagem  — texto livre outbound
 *   • Template  — seleciona template aprovado e substitui body
 *   • Nota      — nota interna (is_internal: true, não enviada ao contato)
 *
 * docs/70-ux/04-screen-inbox.md §3.3 Compositor
 * T-13-16
 */

import { useRef, useState, useTransition, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/actions/result'
import { sendMessage, addInternalNote, listMessageTemplates } from '@/app/(app)/inbox/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Template = { id: string; name: string; body: string }

type Tab = 'message' | 'template' | 'note'

interface MessageComposerProps {
  conversationId: string
  /** Callback opcional: executado após envio bem-sucedido (ex: rolar thread). */
  onMessageSent?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageComposer({ conversationId, onMessageSent }: MessageComposerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('message')

  // ---- shared state ---------------------------------------------------------
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // ---- Tab: Mensagem --------------------------------------------------------
  const [messageBody, setMessageBody] = useState('')

  // ---- Tab: Template --------------------------------------------------------
  const [templates, setTemplates] = useState<Template[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')

  // ---- Tab: Nota interna ----------------------------------------------------
  const [noteBody, setNoteBody] = useState('')

  // ---- Attachment (preview local, sem upload real — P2) --------------------
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Carregar templates ao entrar na aba Template
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'template') return
    if (templates.length > 0) return // já carregado

    setTemplatesLoading(true)
    void (async () => {
      const result: ActionResult<Array<{ id: string; name: string; body: string }>> =
        await listMessageTemplates()
      if (result.ok) {
        setTemplates(result.data)
      }
      setTemplatesLoading(false)
    })()
  }, [activeTab, templates.length])

  // ---------------------------------------------------------------------------
  // Handlers de envio
  // ---------------------------------------------------------------------------

  function clearError() {
    setError(null)
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    handler: (ev: React.FormEvent) => void,
  ) {
    // Enter envia; Shift+Enter quebra linha
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handler(e as unknown as React.FormEvent)
    }
  }

  // ---- Mensagem outbound ----------------------------------------------------
  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = messageBody.trim()
    if (!trimmed) return

    clearError()
    startTransition(async () => {
      const result = await sendMessage(conversationId, trimmed)
      if (!result.ok) {
        setError(result.error.message)
      } else {
        setMessageBody('')
        setAttachmentPreview(null)
        setAttachmentName(null)
        textareaRef.current?.focus()
        onMessageSent?.()
      }
    })
  }

  // ---- Mensagem via template ------------------------------------------------
  function handleSendTemplate(e: React.FormEvent) {
    e.preventDefault()
    const tpl = templates.find((t) => t.id === selectedTemplateId)
    if (!tpl) return

    clearError()
    startTransition(async () => {
      const result = await sendMessage(conversationId, tpl.body)
      if (!result.ok) {
        setError(result.error.message)
      } else {
        setSelectedTemplateId('')
        onMessageSent?.()
      }
    })
  }

  // ---- Nota interna ---------------------------------------------------------
  function handleSendNote(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = noteBody.trim()
    if (!trimmed) return

    clearError()
    startTransition(async () => {
      const result = await addInternalNote(conversationId, trimmed)
      if (!result.ok) {
        setError(result.error.message)
      } else {
        setNoteBody('')
        noteRef.current?.focus()
        onMessageSent?.()
      }
    })
  }

  // ---- Attachment preview ---------------------------------------------------
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAttachmentName(file.name)

    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setAttachmentPreview(ev.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      // Documento: apenas mostrar nome, sem preview
      setAttachmentPreview(null)
    }
  }

  function handleRemoveAttachment() {
    setAttachmentPreview(null)
    setAttachmentName(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="border-t border-border bg-card" role="region" aria-label="Compositor de mensagem">
      {/* Erro global */}
      {error && (
        <p role="alert" className="px-3 pt-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as Tab)
          clearError()
        }}
        className="flex flex-col"
      >
        {/* Barra de tabs */}
        <TabsList className="mx-3 mt-2 self-start h-8 rounded-md bg-muted">
          <TabsTrigger value="message" className="text-xs px-3 h-7">
            Mensagem
          </TabsTrigger>
          <TabsTrigger value="template" className="text-xs px-3 h-7">
            Template
          </TabsTrigger>
          <TabsTrigger value="note" className="text-xs px-3 h-7">
            Nota interna
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Mensagem                                                       */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="message" className="mt-0 p-3 flex flex-col gap-2">
          <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
            {/* Preview de anexo */}
            {attachmentName && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                {attachmentPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachmentPreview}
                    alt={attachmentName}
                    className="h-10 w-10 rounded object-cover flex-shrink-0"
                  />
                ) : (
                  <span className="font-medium truncate max-w-[160px]">{attachmentName}</span>
                )}
                <span className="truncate flex-1">{attachmentPreview ? attachmentName : ''}</span>
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="ml-auto text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Remover anexo"
                >
                  ✕
                </button>
              </div>
            )}

            <Textarea
              ref={textareaRef}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleSendMessage)}
              placeholder="Digite sua mensagem… (Enter para enviar, Shift+Enter para quebrar linha)"
              aria-label="Corpo da mensagem"
              rows={3}
              disabled={isPending}
              className="resize-none text-sm"
              maxLength={4096}
            />

            {/* Rodapé: contador + anexar + enviar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {/* Botão de anexo */}
                <button
                  type="button"
                  aria-label="Anexar imagem"
                  disabled={isPending}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {/* Ícone de clipe */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.doc,.docx"
                  className="sr-only"
                  aria-label="Selecionar arquivo para anexo"
                  onChange={handleFileChange}
                  tabIndex={-1}
                />

                {/* Contador de caracteres */}
                <span
                  className="text-[10px] text-muted-foreground/60"
                  aria-live="polite"
                  aria-label={`${messageBody.length} de 4096 caracteres`}
                >
                  {messageBody.length}/4096
                </span>
              </div>

              <Button
                type="submit"
                size="sm"
                disabled={isPending || messageBody.trim().length === 0}
                aria-busy={isPending}
              >
                {isPending ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Template                                                       */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="template" className="mt-0 p-3 flex flex-col gap-3">
          {templatesLoading ? (
            <p className="text-xs text-muted-foreground">Carregando templates…</p>
          ) : templates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum template disponível. Templates são criados em{' '}
              <span className="font-medium">Configurações › Templates</span>.
            </p>
          ) : (
            <form onSubmit={handleSendTemplate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-select" className="text-xs">
                  Selecionar template
                </Label>
                <select
                  id="template-select"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={isPending}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Selecionar template de mensagem"
                >
                  <option value="">-- Escolha um template --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Preview do template selecionado */}
              {selectedTemplateId && (
                <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                  {templates.find((t) => t.id === selectedTemplateId)?.body}
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !selectedTemplateId}
                  aria-busy={isPending}
                >
                  {isPending ? 'Enviando…' : 'Enviar template'}
                </Button>
              </div>
            </form>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* Tab: Nota interna                                                   */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="note" className="mt-0 p-3 flex flex-col gap-2">
          <form onSubmit={handleSendNote} className="flex flex-col gap-2">
            {/* Indicador visual de nota interna */}
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1">
              {/* Ícone cadeado */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 text-amber-600 dark:text-amber-400 flex-shrink-0"
                aria-hidden="true"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Nota interna — não será enviada ao contato
              </span>
            </div>

            <Textarea
              ref={noteRef}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleSendNote)}
              placeholder="Escreva uma nota interna para a equipe… (Enter para salvar)"
              aria-label="Nota interna"
              rows={3}
              disabled={isPending}
              className="resize-none text-sm bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 focus-visible:ring-amber-400"
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isPending || noteBody.trim().length === 0}
                aria-busy={isPending}
                className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              >
                {isPending ? 'Salvando…' : 'Salvar nota'}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  )
}
