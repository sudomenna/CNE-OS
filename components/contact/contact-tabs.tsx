'use client'

/**
 * ContactTabs — Client Component wrapper para as tabs do detalhe do contato.
 *
 * T-12-16: wiring das 8 tabs em page.tsx
 *
 * As tabs são um componente client (shadcn/Radix) que recebe o conteúdo
 * de cada tab como children (Server Components passados como props via
 * padrão de "slots").
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContactTabsProps {
  defaultTab?: string
  timelineContent: React.ReactNode
  conversasContent: React.ReactNode
  ticketsContent: React.ReactNode
  oportunidadesContent: React.ReactNode
  transacoesContent: React.ReactNode
  direitosContent: React.ReactNode
  notasContent: React.ReactNode
  historicoContent: React.ReactNode
}

// ---------------------------------------------------------------------------
// ContactTabs
// ---------------------------------------------------------------------------

export function ContactTabs({
  defaultTab = 'timeline',
  timelineContent,
  conversasContent,
  ticketsContent,
  oportunidadesContent,
  transacoesContent,
  direitosContent,
  notasContent,
  historicoContent,
}: ContactTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList className="flex h-auto flex-wrap gap-1 bg-muted p-1 rounded-md w-full justify-start">
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="conversas">Conversas</TabsTrigger>
        <TabsTrigger value="tickets">Tickets</TabsTrigger>
        <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
        <TabsTrigger value="transacoes">Transacoes</TabsTrigger>
        <TabsTrigger value="direitos">Direitos</TabsTrigger>
        <TabsTrigger value="notas">Notas</TabsTrigger>
        <TabsTrigger value="historico">Historico</TabsTrigger>
      </TabsList>

      <TabsContent value="timeline" aria-label="Aba Timeline">
        {timelineContent}
      </TabsContent>

      <TabsContent value="conversas" aria-label="Aba Conversas">
        {conversasContent}
      </TabsContent>

      <TabsContent value="tickets" aria-label="Aba Tickets">
        {ticketsContent}
      </TabsContent>

      <TabsContent value="oportunidades" aria-label="Aba Oportunidades">
        {oportunidadesContent}
      </TabsContent>

      <TabsContent value="transacoes" aria-label="Aba Transacoes">
        {transacoesContent}
      </TabsContent>

      <TabsContent value="direitos" aria-label="Aba Direitos">
        {direitosContent}
      </TabsContent>

      <TabsContent value="notas" aria-label="Aba Notas">
        {notasContent}
      </TabsContent>

      <TabsContent value="historico" aria-label="Aba Historico">
        {historicoContent}
      </TabsContent>
    </Tabs>
  )
}
