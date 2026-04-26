import type { ColumnDef } from '@/lib/hooks/use-column-visibility'

export const CONTACTS_LIST_TABLE_ID = 'contacts:list' as const

export const CONTACT_COLUMNS: ColumnDef[] = [
  { id: 'name', label: 'Nome', alwaysVisible: true },
  { id: 'email', label: 'E-mail', defaultVisible: true },
  { id: 'phone', label: 'Telefone', defaultVisible: true },
  { id: 'classification', label: 'Classificação', defaultVisible: true },
  { id: 'status', label: 'Status', defaultVisible: true },
  // Avançadas — nascem ocultas; usuário ativa via customizer
  { id: 'cpf', label: 'CPF', defaultVisible: false },
  { id: 'createdAt', label: 'Criado em', defaultVisible: false },
  { id: 'actions', label: 'Ações', alwaysVisible: true },
]
