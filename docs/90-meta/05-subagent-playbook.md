# Playbook de subagents — paralelização segura

Protocolo operacional para despachar múltiplos subagents codificadores em paralelo **sem conflito**.

## 1. Princípios

1. **Unidade de paralelização = T-ID** (tarefa de roadmap). Nunca paralelize tarefas sem ID.
2. **Arquivos disjuntos.** Duas tarefas em paralelo **nunca** editam o mesmo arquivo.
3. **Contratos são seriais.** `docs/30-contracts/*` e `lib/db/schema/index.ts` são editados por uma tarefa por vez.
4. **Enforcement de ownership.** Um subagent só edita arquivos declarados em `Ownership` do módulo da tarefa. Violação = abortar.
5. **Uma onda por vez.** Aguardar todos os subagents da onda N terminarem antes de abrir N+1.
6. **Verde entre ondas.** Ao fim de cada onda, rodar `pnpm typecheck && pnpm lint && pnpm test`. Se falhar, corrigir antes de prosseguir.
7. **Ambiguidade → parar.** Subagent que bate em ambiguidade registra em `03-open-questions-log.md` e retorna controle.

## 2. Campos obrigatórios de uma tarefa paralelizável

Em `80-roadmap/<sprint>.md`, cada linha de tabela tem:

```
| ID        | Título              | Módulo       | Tipo    | Parallel-safe | Depends-on | Specs referenciadas | Critério de aceite |
| T-1-01    | schema contact      | MOD-CONTACT  | schema  | yes           | —          | BR-IDENTITY, enums  | tabela + testes OK |
```

- **Parallel-safe = yes** apenas se:
  - Edita só arquivos do Ownership do módulo.
  - Não muda enums nem contratos.
  - Não muda interface pública de outro módulo.
  - Dependências já `completed`.

## 3. Protocolo de despacho (Claude principal → subagents)

Para cada onda:

1. Ler `80-roadmap/<sprint>.md`, filtrar tarefas com `parallel-safe: yes` e `depends-on` resolvido.
2. Conferir que arquivos-alvo são disjuntos (tabela de ownership).
3. Abrir **uma mensagem com N chamadas `Agent`** (até 5), uma por T-ID, cada uma com prompt autocontido.
4. Aguardar todas retornarem.
5. Rodar verificação local:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
6. Se verde: marcar T-IDs como `completed`; avançar para próxima onda.
7. Se vermelho: identificar causa; despachar correção solo, nunca em paralelo com a correção.

## 4. Template de prompt de subagent executor

```
# Task: <T-ID> — <título>

## Contexto obrigatório (carregar nesta ordem, não outros)
1. /Users/tiagomenna/Projetos/CNE-OS/docs/README.md
2. /Users/tiagomenna/Projetos/CNE-OS/AGENTS.md
3. /Users/tiagomenna/Projetos/CNE-OS/docs/20-domain/<arquivo>.md
4. BRs referenciadas pelo módulo: <listar>
5. /Users/tiagomenna/Projetos/CNE-OS/docs/30-contracts/01-enums.md
6. /Users/tiagomenna/Projetos/CNE-OS/docs/30-contracts/02-db-schema-conventions.md
7. Linha da tarefa em /Users/tiagomenna/Projetos/CNE-OS/docs/80-roadmap/<sprint>.md

## Ownership autorizado
Você pode EDITAR apenas:
- <path1>
- <path2>

Você pode LER (sem editar):
- <path3>

## Objetivo
<especificação da tarefa — o que deve existir ao final>

## Critério de aceite
- [ ] Typecheck limpo
- [ ] Lint limpo
- [ ] Teste novo cobrindo caso Given/When/Then de BR-<ID>
- [ ] Teste unit passando

## Protocolo de ambiguidade
Se a spec não cobre o caso: PARE. Abra docs/90-meta/03-open-questions-log.md, registre como OQ-<NN>, devolva controle.

## Proibido
- editar arquivos fora do Ownership
- adicionar enum novo (tarefa serial dedicada)
- mudar interface pública de outro módulo
- introduzir dependência nova no package.json
```

## 5. Ondas exemplares (Sprint 1-2, CRM Core — ilustrativo)

**Onda A (paralelo, 4 subagents):**
- T-1-01 `lib/db/schema/contact.ts`
- T-1-02 `lib/db/schema/contact_phone.ts`
- T-1-03 `lib/db/schema/contact_email.ts`
- T-1-04 `lib/db/schema/contact_document.ts`

→ arquivos disjuntos, mesmo módulo, mesmo sprint.

**Onda B (serial, depende de A):**
- T-1-05 `lib/domain/contact/identity.ts` + testes

→ lógica concentrada que consome schemas da A.

**Onda C (paralelo, 3 subagents, depende de B):**
- T-1-06 `app/(app)/contacts/actions.ts` (server action)
- T-1-07 `app/(app)/contacts/new/page.tsx` (UI)
- T-1-08 `tests/unit/domain/contact/identity.test.ts` (testes exhaustivos)

## 6. Casos onde NÃO paralelizar

- Adicionar/remover enum ou valor de enum.
- Mudar interface pública em `30-contracts/07-module-interfaces.md`.
- Criar migração que altera tabela tocada por outra migração pendente.
- Editar `lib/db/schema/index.ts` (arquivo compartilhado).
- Integração nova que muda `webhook_log` schema.
- Primeira implementação de um novo módulo (fazer sozinho, sem paralelo, para estabelecer forma).

## 7. Registro de paralelização

Manter `TaskList` do harness com 1 tarefa por T-ID. Atualizar status em cada transição. Evita subagents competindo por mesma tarefa.

## 8. Fallback

Se um subagent demora, trava ou entrega código quebrado: abortar, reabrir T-ID, despachar de novo com instruções refinadas. Nunca deixar onda "pela metade" — ou toda a onda merge ou nenhuma.

## 9. Definition of Done por T-ID

Um T-ID só vira `completed` quando **todos** os critérios abaixo são satisfeitos. Essa lista é complementar aos critérios de aceite do sprint (`99-acceptance-criteria-by-sprint.md`) e à matriz de testes (`98-test-matrix-by-sprint.md`).

1. ✅ **Código dentro do ownership**: arquivos editados batem com a lista `Edita:` da tarefa e com `80-roadmap/97-ownership-matrix.md`. Zero edição lateral.
2. ✅ **Testes exigidos pela camada**:
   - Unit sempre obrigatório quando a tarefa implementa regra/transformação.
   - Integration obrigatório quando toca DB, trigger, RLS, webhook ou Inngest handler.
   - E2E obrigatório quando a tarefa concretiza jornada listada na matriz do sprint.
3. ✅ **Doc atualizada** no mesmo commit (ver `CLAUDE.md §10`) OU entrada `[SYNC-PENDING]` em `MEMORY.md §2` quando a atualização foi deliberadamente adiada.
4. ✅ **Verificação local verde**: `bash scripts/verify-wave.sh --fast` (typecheck + lint + test) no fim do T-ID; full verify após fim da onda.
5. ✅ **Review aprovado** (humano ou `cne-br-auditor` em módulo sensível).
6. ✅ **Security review aprovado** quando toca: `lib/auth/*`, `lib/db/schema/role.ts`, RBAC matrix, webhook signature, refund flow, RLS policy.

Se **qualquer** item falha, o T-ID volta para `in-progress` — nunca `completed` parcial.

## 10. Template de TaskList (acompanhamento de T-IDs)

Acompanhamento vive no `TaskList` do harness Claude Code (memória da sessão). Formato canônico de cada item:

```
[<STATUS>] <T-ID>: <título curto>
  Módulo: MOD-<X>
  Subagent: <cne-schema-author | cne-domain-author | ...>
  Depends-on: <T-IDs ou "—">
  Arquivos owned: <lista>
  Específicos: <link para linha em 80-roadmap/<sprint>.md>
  PR: #<N> (quando aberto)
```

Status = `pending | in_progress | blocked | completed`. Apenas **uma** tarefa em `in_progress` por subagent simultâneo.

**Regras:**
- Abrir onda = criar N itens `in_progress` em paralelo (1 por subagent).
- `blocked` = subagent parou (ambiguidade, OQ levantada). Registrar em `03-open-questions-log.md` + escalar para humano.
- `completed` só após DoD §9 satisfeito.
- Ao fim da onda, rodar `scripts/verify-wave.sh`. Se verde, marcar todos `completed` e abrir próxima onda.

## 11. Subagents customizados disponíveis

Ver `.claude/agents/*.md` no repo e `CLAUDE.md §11`. Resumo por papel:

| Papel | Subagent | Invocar quando |
|---|---|---|
| Schema + migration | `cne-schema-author` | Tarefa `schema` |
| Regras puras de domínio | `cne-domain-author` | Tarefa que implementa BR-* em `lib/domain/*` |
| Adapter de webhook | `cne-integration-author` | Tarefa em `lib/integrations/<provider>/` |
| UI + Server Actions | `cne-ui-author` | Tarefa em `app/(app)/<mod>/` |
| Testes (qualquer camada) | `cne-test-author` | Tarefa de escrever/cobrir testes |
| Auditoria de BR | `cne-br-auditor` | Pré-merge em módulo sensível |
| Doc-sync | `cne-docs-sync` | Fim de T-ID ou onda |

Quando a tarefa não casa com nenhum papel, use `general-purpose` com prompt explícito de ownership.
