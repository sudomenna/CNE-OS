'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface HotkeyRow {
  keys: string[]
  action: string
}

const HOTKEYS: HotkeyRow[] = [
  { keys: ['g', 'i'], action: 'Ir para Inbox' },
  { keys: ['g', 'c'], action: 'Ir para Contatos' },
  { keys: ['g', 'f'], action: 'Ir para Funis' },
  { keys: ['g', 'o'], action: 'Ir para Ofertas' },
  { keys: ['g', 'a'], action: 'Ir para Analytics' },
  { keys: ['g', 't'], action: 'Ir para Tickets' },
  { keys: ['?'], action: 'Este dialog' },
  { keys: ['/'], action: 'Busca global' },
  { keys: ['⌘K'], action: 'Paleta de comandos' },
]

interface HotkeysHelpDialogProps {
  open: boolean
  onClose: () => void
}

export function HotkeysHelpDialog({ open, onClose }: HotkeysHelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="pb-2 text-left font-medium text-muted-foreground w-1/3">Tecla</th>
              <th className="pb-2 text-left font-medium text-muted-foreground">Ação</th>
            </tr>
          </thead>
          <tbody>
            {HOTKEYS.map((row) => (
              <tr key={row.keys.join('+')} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-1">
                    {row.keys.map((k, idx) => (
                      <span key={idx} className="flex items-center gap-1">
                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                          {k}
                        </kbd>
                        {idx < row.keys.length - 1 && (
                          <span className="text-muted-foreground text-xs">then</span>
                        )}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="py-2 text-foreground">{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  )
}
