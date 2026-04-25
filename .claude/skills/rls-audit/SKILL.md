---
name: rls-audit
description: Audita políticas RLS no Supabase — lista tabelas sem RLS e gera SQL de políticas com base nos papéis do projeto (admin, member, viewer)
---

Você vai auditar e gerar políticas RLS para o projeto CNE-OS.

## Contexto obrigatório

Leia:
1. `AGENTS.md` — entender papéis e modelo de permissão
2. `docs/10-architecture/02-stack.md` — confirmar stack Supabase
3. `lib/db/schema/` — listar todas as tabelas existentes
4. `supabase/migrations/` — ver quais políticas RLS já existem

## Passo 1 — Inventário de tabelas

Liste todas as tabelas em `lib/db/schema/*.ts` e classifique cada uma:
- **Sensível** (contém dados financeiros, PII, ou permissões): transaction, entitlement, refund, billing_subscription, billing_installment, contact, offer, snapshot
- **Operacional** (logs, eventos): timeline_event, automation_execution, automation_execution_log
- **Configuração** (setup por admin): automation_flow, automation_node, funnel, campaign, offer_template

## Passo 2 — Verificar RLS existente

Verifique em `supabase/migrations/` quais tabelas já têm políticas RLS criadas. Liste o que **falta**.

As tabelas com RLS pendente conhecidas (MEMORY.md §5):
- `transaction`
- `entitlement`
- `refund`
- `billing_subscription` / `billing_installment`

## Passo 3 — Gerar SQL de políticas

Para cada tabela sem RLS, gere um arquivo SQL seguindo este padrão:

```sql
-- Habilitar RLS
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

-- Admin: acesso total
CREATE POLICY "<tabela>_admin_all"
  ON <tabela>
  FOR ALL
  TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

-- Member: leitura + escrita própria
CREATE POLICY "<tabela>_member_select"
  ON <tabela>
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'member'));

-- Viewer: somente leitura
CREATE POLICY "<tabela>_viewer_select"
  ON <tabela>
  FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'role' IN ('admin', 'member', 'viewer'));
```

Adapte as políticas ao modelo de dados de cada tabela (ex: `contact` pode ter filtro por `brand_id`).

## Passo 4 — Reportar

Produza:
1. Tabela resumo: quais têm RLS ✅, quais estão pendentes ❌
2. SQL gerado para cada tabela pendente (pronto para criar migration via `drizzle-kit generate`)
3. Alerta se alguma tabela sensível estiver sem RLS e sem plano

**Não** aplique as migrations automaticamente — apresente o SQL ao humano para revisão.
