'use client'

/**
 * TransactionTabs — Client Component wrapper para as tabs do detalhe de transação.
 *
 * T-12-31: 6 tabs em /transactions/[id]
 *
 * Recebe o conteúdo de cada tab como children (Server Components passados
 * como props no padrão de "slots" — compatível com RSC + App Router).
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface TransactionTabsProps {
  defaultTab?: string
  itensContent: React.ReactNode
  snapshotContent: React.ReactNode
  parcelasContent: React.ReactNode
  direitosContent: React.ReactNode
  auditoriaContent: React.ReactNode
  timelineContent: React.ReactNode
}

export function TransactionTabs({
  defaultTab = 'itens',
  itensContent,
  snapshotContent,
  parcelasContent,
  direitosContent,
  auditoriaContent,
  timelineContent,
}: TransactionTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList className="flex h-auto flex-wrap gap-1 bg-muted p-1 rounded-md w-full justify-start">
        <TabsTrigger value="itens">Itens</TabsTrigger>
        <TabsTrigger value="snapshot">Snapshot</TabsTrigger>
        <TabsTrigger value="parcelas">Parcelas/Assinatura</TabsTrigger>
        <TabsTrigger value="direitos">Direitos</TabsTrigger>
        <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>

      <TabsContent value="itens" aria-label="Aba Itens">
        {itensContent}
      </TabsContent>

      <TabsContent value="snapshot" aria-label="Aba Snapshot">
        {snapshotContent}
      </TabsContent>

      <TabsContent value="parcelas" aria-label="Aba Parcelas e Assinatura">
        {parcelasContent}
      </TabsContent>

      <TabsContent value="direitos" aria-label="Aba Direitos">
        {direitosContent}
      </TabsContent>

      <TabsContent value="auditoria" aria-label="Aba Auditoria">
        {auditoriaContent}
      </TabsContent>

      <TabsContent value="timeline" aria-label="Aba Timeline">
        {timelineContent}
      </TabsContent>
    </Tabs>
  )
}
