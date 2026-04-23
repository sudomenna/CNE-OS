# Análise arquitetural + roadmap do PRD V2 — CNE Educação

## Contexto

O PRD V2 está **maduro no domínio de negócio** (identidade de contato, motor de ofertas, snapshot imutável, multi-marca) mas ainda **não é executável como contrato de engenharia**: mistura níveis de abstração, tem ambiguidades sutis, ignora requisitos não-funcionais críticos e não decide questões que travam a modelagem de banco.

Este documento serve três propósitos:

1. **Consolidar decisões tomadas** nesta sessão (stack, escopo, regras).
2. **Listar os gaps e ambiguidades do PRD** que precisam ser corrigidos no texto.
3. **Propor uma reorganização do documento** para um fluxo fluido entre produto, design e engenharia.

---

## 1. Decisões consolidadas nesta sessão

| Tema | Decisão |
|---|---|
| Desenvolvedor | Claude Code com subagents; foco forte em UX, UI moderna/intuitiva, **shadcn/ui** |
| Stack frontend | Next.js (App Router) + TypeScript + shadcn + Tailwind |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage + RLS + pgvector) |
| Escala atual | <50k contatos, <500 vendas/mês |
| LGPD Fase 1 | **Adiada** (risco aceito) — documentar e revisitar na Fase 2 |
| Checkout | **Hospedado do Digital Guru**, integração por webhook |
| Inbox omnichannel | Push realtime na web + notificação desktop quando atribuído |
| Mobilidade | Responsivo (PWA) no MVP, sem app nativo |
| Migração | Dual-run, módulo a módulo |
| Reembolso | Revoga direitos + snapshot flagado "refunded" + reclassifica contato + **libera recompra** |
| Cobrança Fase 1 | **Assinaturas + parcelamento + inadimplência** (expansão grande do escopo — ver §3.1) |
| Renovação de direito | Via **nova oferta de renovação**, preservando regra "compra única por oferta" |
| Emissão fiscal | CNPJ emissor é **atributo fixo da oferta** |
| Identidade contato | **Telefone > e-mail** (quando não há CPF) |
| Race "30 primeiros" | Atomic counter, **permite excesso** (pode ir a 31+) |
| Imutabilidade | **Snapshot em `jsonb` + audit tables append-only** por entidade crítica |

### 1.1. Por que Supabase e não Convex

O domínio do sistema é **denso em relacional e regras transacionais**: motor de ofertas com condições/regras/itens, prioridade + score + timestamp como desempate, contador atômico de vendas, timeline agregando 10 fontes, dashboards analíticos.

- **Supabase** é Postgres puro → joins complexos, SQL analítico nativo para dashboards, `jsonb` para snapshots, `pgvector` para embeddings/RAG dos agentes futuros, RLS para multi-marca, triggers para audit, CDC/realtime via `pg_notify`. Ecosistema enorme de integrações.
- **Convex** é excelente para UIs reativas e workflows agênticos puros, mas o modelo de documentos + indexes programáticos machuca quando você precisa de SQL analítico e joins profundos.

Supabase também não impede agentes: `pgvector` é embutido, Edge Functions rodam ações, e qualquer agent framework (LangGraph, Mastra, agent SDK) plugga em cima sem fricção.

---

## 2. Stack recomendada (detalhada)

| Camada | Escolha | Razão |
|---|---|---|
| Framework | Next.js 15 (App Router) + Server Actions | Produtividade máxima com Claude Code, SSR/RSC, streaming |
| UI | shadcn/ui + Tailwind + Radix | Pedido explicitamente, ótimo com agentes |
| Auth | Supabase Auth (email/senha + magic link; 2FA via TOTP) | Incluso, RLS integrado |
| DB | Postgres gerenciado (Supabase) | Decisão acima |
| ORM | **Drizzle** | Types end-to-end, SQL-first, melhor para snapshots e queries complexas que Prisma |
| Realtime | Supabase Realtime (Postgres CDC) | Inbox push, timeline viva |
| Storage | Supabase Storage | Anexos de mensagem, criativos |
| Fila/jobs | **Inngest** ou `pg-boss` | Webhooks Digital Guru (idempotentes), envios Brevo, automações. Inngest se quiser retries/observabilidade out-of-the-box; pg-boss se quiser lean e tudo dentro do Postgres |
| Observabilidade | Sentry + Vercel Analytics + Axiom (logs) | Baixo esforço, bom sinal |
| Testes | Vitest + Playwright | Regras de negócio (vitest) e fluxos críticos (checkout webhook, merge) em Playwright/API tests |
| Deploy | Vercel (front) + Supabase (back) | Zero ops, compatível com Claude Code |

---

## 3. Gaps do PRD que precisam ser corrigidos antes de codar

### 3.1. Escopo de cobrança foi inflado sem estar no PRD
A decisão "cobrança = tudo" trouxe assinaturas, parcelamento e inadimplência para a Fase 1, **mas o PRD V2 não modela nada disso**. Impacto:
- Precisa entidade `subscription` (ciclo, status, próximo débito, trial, cancelamento).
- Precisa entidade `installment` (parcela, vencimento, status, boleto/link).
- Precisa mapeamento dos eventos do Digital Guru para esses ciclos.
- "Inadimplência consolidada" no dashboard precisa fonte real.

**Ação:** ou adicionamos um Módulo 10b "Assinaturas e Parcelamento" ao PRD, ou re-escopamos a Fase 1 (recomendo fortemente revisitar — pode dobrar a Fase 1).

### 3.2. Reembolso
A decisão agora define: revoga direitos, flag `refunded` no snapshot, reclassifica contato, libera recompra. **Escrever isso no Módulo 10 como regras formais.**

### 3.3. Regras de identidade (§9.2.2)
O texto atual é difícil de parsear e tem contradição aparente. Substituir por **tabela de decisão explícita**:

| CPF input | Telefone input | E-mail input | Ação |
|---|---|---|---|
| novo | — | — | cria contato |
| existente | match | match | noop |
| existente | match | diferente | adiciona e-mail alternativo, pendência |
| existente | diferente | match | atualiza telefone principal, arquiva antigo, pendência |
| ausente | match | diferente | mesmo contato, adiciona e-mail alternativo |
| ausente | diferente | match | **novo contato**, abre pendência (e-mail duplicado) |
| ausente | match | match | noop |
| ausente | diferente | diferente | novo contato |

Critério: **CPF é chave absoluta; na ausência dele, telefone > e-mail.**

### 3.4. Renovação + "compra única"
Formalizar que uma oferta `offer_type = 'renewal'` tem um `renews_offer_id` apontando para a oferta original, e que ao aplicar, estende/substitui o direito existente em vez de criar novo.

### 3.5. Classificação de produto (curso/ebook/treinamento)
Citado em §9.2.8 mas não modelado. Adicionar `product_category` ou `product_kind` enum no Módulo 8, pois a regra "compra de curso → aluno" depende disso.

### 3.6. "Aluno" sem LMS
Na Fase 1 "aluno" é uma **classificação do contato** (tag/status), não uma entidade separada. O acesso ao curso permanece na ferramenta externa atual até o LMS entrar na Fase 2. Documentar explicitamente.

### 3.7. Autenticação, RBAC, auditoria (§13.5 está fraco)
Mesmo adiando LGPD, precisamos:
- Matriz RBAC por entidade × ação (criar/ler/atualizar/apagar) por papel.
- Trilha de auditoria das ações críticas: merge, reembolso, alteração de oferta/condição, exclusão de contato, mudança de status de transação.
- 2FA para admin e financeiro desde o dia 1.

### 3.8. Idempotência e DLQ nas integrações
Digital Guru webhook precisa:
- `event_id` único → tabela `webhook_log` com UNIQUE constraint.
- Retry automático com backoff.
- Dead-letter queue para eventos não-mapeáveis.
- Reprocessamento manual a partir do log.

### 3.9. Gestão de mídia
Limites de tamanho de anexos (inbox), tipos permitidos, retenção, CDN à frente do Storage. Definir no módulo de NFR.

### 3.10. SLA/observabilidade/backup
- Inbox: objetivo de 99.5% (1h/mês aceitável? definir).
- Backup Supabase default (PITR) é suficiente; documentar RPO=5min RTO=1h.
- Logs estruturados em todas rotas críticas.

---

## 4. Reorganização proposta do documento

O PRD atual mistura princípios, regras, requisitos, sugestões de entidade e enums num fluxo linear. Proposta: quebrar em **5 documentos** (ou 5 seções principais num documento único de pastas):

### Doc 1 — **Product Brief** (executivo, ~3 páginas)
Visão, problema, norte estratégico, objetivos, métricas de sucesso, fora de escopo.
Consolida §1, §2, §3, §7, §14, §17, §18.

### Doc 2 — **Domain Model**
Uma seção por agregado, sempre com o mesmo template:
- finalidade
- entidades e relações
- invariantes (regras que nunca podem ser violadas)
- estados e transições (state machine explícita)
- **tabelas de decisão** para regras complexas
- exemplos

Agregados: Contato · Conversa · Ticket · Campanha · Funil · Oferta · Transação · Direito Adquirido · Assinatura (novo) · Automação.

### Doc 3 — **Business Rules Catalog**
Cada regra com ID rastreável, ex.:

```
BR-CONTACT-IDENTITY-003
Entidade: Contact
Descrição: Se não houver CPF e o telefone colidir, o contato é unificado.
Origem: Produto
Critério de aceite: teste `contact_merge.identity.phone_wins.test.ts`
```

### Doc 4 — **Flows**
Os 6 fluxos do §11 + novos:
- reembolso end-to-end
- merge manual assistido
- resolução de pendência de identidade
- renovação de direito via nova oferta
- ciclo de assinatura (se Fase 1 inclui)
- reprocessamento de webhook

Formato: pré-condições, passos, pós-condições, erros esperados.

### Doc 5 — **Architecture & NFR**
Volumes, SLA, RPO/RTO, segurança mínima sem LGPD formal, autenticação/RBAC, observabilidade, modelo canônico de integração, idempotência/retry/DLQ, realtime, storage, deploy.
Expande e substitui o §13.

### Glossário
Termos frequentemente ambíguos: oferta, condição, opção de pagamento, item comercial, direito adquirido, aluno, lead pago, oportunidade, pendência.

---

## 5. Roadmap executivo de implementação (Fase 1)

### 5.1. Sprint 0 — Fundações (semana 1-2)
- Setup Next.js + Supabase + shadcn + Drizzle + Inngest + Sentry
- Schema inicial: `brand`, `legal_entity`, `brand_legal_entity`, `user`, `role`, `permission`
- Autenticação Supabase + proteção por role
- Design system base com shadcn e tokens de marca
- Layout base: shell do app, sidebar, topbar, command palette

### 5.2. Sprint 1-2 — CRM Core (semanas 3-6)
- Entidades `contact`, `contact_phone`, `contact_email`, `contact_document`, `contact_tag`, `contact_note`, `contact_custom_field`
- Tabela de decisão de identidade implementada em função Postgres + testes
- `contact_issue` (pendências) + UI de resolução manual
- `contact_merge` não-destrutivo + undo
- Página do contato com timeline unificada (`timeline_event`)

### 5.3. Sprint 3-4 — Inbox & Tickets (semanas 7-10)
- `conversation`, `message`, `channel`, `channel_account`
- WhatsApp API Oficial + Instagram + e-mail
- Realtime push para atendentes (Supabase Realtime)
- Notificação desktop/som via Web Notifications API
- `ticket` com separação conversa ≠ ticket

### 5.4. Sprint 5 — Marketing, Funis, Oportunidades (semanas 11-13)
- `campaign`, `creative`, `trackable_link`, UTM generator
- `funnel`, `funnel_stage`, `funnel_entry` (oportunidade)
- Score configurável, histórico de estágio
- Metas comerciais

### 5.5. Sprint 6-7 — Motor Comercial (semanas 14-17)
- `product`, `product_kind`, `commercial_benefit`
- `offer`, `offer_condition`, `offer_condition_rule`, `offer_condition_item`, `offer_payment_option`
- Engine de decisão de condição (prioridade → score → timestamp → conflict)
- Contador atômico de vendas por oferta

### 5.6. Sprint 8 — Snapshot, Direitos, Integração Digital Guru (semanas 18-20)
- `transaction` + `transaction_snapshot` (jsonb) + `transaction_item`
- `customer_entitlement` + histórico de direito
- `webhook_log` com idempotência + DLQ
- Mapeamento canônico Digital Guru → modelo interno
- Fluxo de reembolso completo

### 5.7. Sprint 9 — Assinaturas/Parcelamento (semanas 21-23) **[escopo novo descoberto]**
- `subscription`, `installment`, ciclo de cobrança
- Inadimplência consolidada no dashboard

### 5.8. Sprint 10 — Analytics & Dashboards (semanas 24-25)
- Views e materialized views para leituras prioritárias de §9.13
- Dashboards gerenciais por marca, funil, campanha, criativo

### 5.9. Sprint 11 — Automações visuais (semanas 26-27)
- `automation_flow`, `automation_trigger`, `automation_action`
- Execução por workers (Inngest)

**Total estimado Fase 1: ~27 semanas (~6 meses)** — pode ser reduzido se o escopo de cobrança for re-enxutado.

---

## 6. Próximos passos imediatos (após aprovação deste plano)

1. **Atualizar o PRD** incorporando as decisões da §1 e reorganizando conforme §4.
2. **Substituir §9.2.2** pela tabela de decisão de identidade.
3. **Adicionar Módulo 10b** (assinaturas/parcelamento) OU re-escopar cobrança.
4. **Formalizar reembolso** no Módulo 10.
5. **Definir matriz RBAC** em tabela explícita.
6. **Iniciar Sprint 0** (setup + esquema base) para materializar a arquitetura.

---

## 7. Arquivos que serão criados no Sprint 0 (referência para execução)

```
/app
  /(auth)/login
  /(app)/contacts
  /(app)/inbox
  /(app)/funnels
  /(app)/offers
  /(app)/transactions
  /(app)/analytics
  /(app)/settings
/lib
  /db/schema            # Drizzle schemas por agregado
  /db/migrations
  /auth                 # helpers Supabase Auth + RBAC
  /domain               # regras de negócio puras, testáveis
  /integrations/digital-guru
  /integrations/brevo
  /integrations/whatsapp
  /integrations/notazz
/components/ui          # shadcn
/components             # domain-specific components
/inngest                # jobs
/tests
  /unit                 # regras de domínio
  /integration          # webhooks, merge, snapshot
  /e2e                  # fluxos críticos
```

---

## 8. Verificação

Após o Sprint 0 estar pronto, validar:

- [ ] Login funciona com Supabase Auth, sessão persistida
- [ ] Um usuário admin consegue ver marcas cadastradas
- [ ] RLS bloqueia acesso cross-marca quando usuário tem escopo restrito (futuro)
- [ ] Migrações Drizzle rodam limpas em ambiente novo
- [ ] Testes unitários executam em CI
- [ ] Sentry captura erros de runtime
- [ ] Deploy automático no Vercel a partir de `main`

Cada sprint subsequente tem seus próprios critérios de aceite amarrados aos IDs de regras do Business Rules Catalog.
