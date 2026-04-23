# CLAUDE.md — Instruções específicas para Claude Code

Leia `AGENTS.md` primeiro (contrato agente-agnóstico). Este arquivo adiciona instruções específicas ao Claude Code (subagents, skills, paralelização).

## 1. Estratégia de subagents

Use subagents para: (a) isolar contexto em tarefas grandes, (b) paralelizar módulos independentes, (c) proteger o contexto principal de resultados volumosos de busca.

| Situação | Subagent | Motivo |
|---|---|---|
| Encontrar onde uma regra já está implementada | `Explore` | busca rápida, não edita |
| Planejar agregado novo complexo | `Plan` | não edita, propõe implementação |
| Executar tarefa isolada do roadmap (schema + domínio + teste) | `general-purpose` | pode editar, escopo controlado |
| Review de código pronto | skill `/review` | padrão do harness |
| Review de segurança (pré-merge) | skill `/security-review` | padrão do harness |
| Reduzir duplicação / simplificar | skill `/simplify` | padrão do harness |

Nunca use subagent para tarefas triviais (edição de 1 linha, rename local).

## 2. Paralelização — protocolo operacional

Detalhe completo em `docs/90-meta/05-subagent-playbook.md`. Versão curta:

1. Unidade de paralelização = **T-ID** (tarefa do roadmap em `docs/80-roadmap/*`).
2. Despache em paralelo **apenas** T-IDs com `parallel-safe: yes` e arquivos disjuntos.
3. Ondas: abra N subagents em uma mesma mensagem (uma chamada `Agent` por T-ID). Aguarde todos terminarem antes de abrir a próxima onda.
4. Máximo recomendado por onda: 3-5 subagents.
5. Integre após cada onda: `pnpm typecheck && pnpm test`. Só avance para a próxima onda se verde.
6. **Edição em `docs/30-contracts/*` é sempre serial** — nunca em paralelo (fonte única).
7. Mantenha `TaskList` atualizada: 1 tarefa principal = 1 T-ID em progresso; marque `completed` só quando merge verde.

### Exemplo de prompt para subagent executor

```
Tarefa: T-1-01 — schema Drizzle de `contact`
Módulo: docs/20-domain/02-contact-identity.md
Contexto obrigatório a carregar (nesta ordem):
1. docs/README.md
2. AGENTS.md
3. docs/20-domain/02-contact-identity.md
4. docs/50-business-rules/BR-IDENTITY.md
5. docs/30-contracts/01-enums.md
6. docs/30-contracts/02-db-schema-conventions.md
7. docs/80-roadmap/01-sprint-1-2-crm-core.md (linha T-1-01)

Ownership: edite apenas lib/db/schema/contact.ts.
Se precisar tocar em outro arquivo, pare e registre em docs/90-meta/03-open-questions-log.md.

Saída esperada:
- lib/db/schema/contact.ts com tabela `contact` e constraints de BR-IDENTITY
- arquivo de teste lib/db/schema/contact.test.ts cobrindo invariantes
- typecheck limpo
```

## 3. Ordem fixa de carga de contexto

Para qualquer tarefa:

1. `docs/README.md`
2. `AGENTS.md` + `CLAUDE.md`
3. Arquivo do módulo-alvo (`docs/20-domain/<nn>-*.md`)
4. BRs referenciadas
5. Contratos citados (enums, schema conventions, module interfaces)
6. Linha da tarefa no sprint

**Não** carregue outros módulos. Se precisar de algo de outro módulo, consulte apenas a interface pública em `docs/30-contracts/07-module-interfaces.md`.

## 4. Comandos de verificação

```bash
pnpm typecheck            # tsc --noEmit
pnpm lint                 # eslint
pnpm test                 # vitest
pnpm test:e2e             # playwright
pnpm drizzle-kit generate # após mudar schema
pnpm drizzle-kit push     # aplicar em dev
```

Rodar `typecheck + test` após cada tarefa antes de marcar `completed`.

## 5. Comandos proibidos sem aprovação explícita

- `git push --force`, `git push -f`
- `git reset --hard`, `git checkout .`, `git clean -fd`
- `drizzle-kit drop`, `supabase db reset`
- `rm -rf` em qualquer subdir do projeto
- Qualquer comando que exclua dados em Supabase remoto
- Deploy manual (`vercel --prod`)

## 6. Skills disponíveis (ver system reminder)

- `/init` — só se CLAUDE.md não existir (já existe, não rodar).
- `/review` — para review de PR.
- `/security-review` — antes de merge de mudanças sensíveis (auth, RBAC, webhooks, reembolso).
- `/simplify` — pós-implementação quando código parece inflado.
- `/fewer-permission-prompts` — otimizar allowlist.
- `/update-config`, `/keybindings-help` — manutenção de harness.

## 7. Citação de regras em código

Use `// BR-<ID>: <razão curta>` **apenas** quando:
- A lógica implementa uma regra de negócio não-óbvia do nome da função
- O leitor precisaria consultar a spec para entender o porquê

Exemplos OK:
```ts
// BR-OFFER-DECISION §3: desempate por timestamp mais recente
const chosen = sorted[0];

// BR-SNAPSHOT-IMMUTABILITY: nunca UPDATE em transaction_snapshot
return db.insert(transactionSnapshot).values(snapshot);
```

Nunca OK:
```ts
// Validate email  <- o próprio nome já diz
if (!isValidEmail(x)) ...
```

## 8. Quando pedir decisão ao humano

- Ambiguidade em BR (registrar em OQ log + perguntar)
- Conflito entre dois docs de spec (provavelmente bug de doc — escalar)
- Proposta de mudança em `docs/30-contracts/*` vinda de uma tarefa de outro módulo (sempre serializar)
- Necessidade de novo enum
- Mudança de versão major na stack
- **Qualquer item da stack que não conseguir instalar, configurar ou usar** (ver §12 abaixo)

## 9. Interação com memória (`.claude/memory/`)

- Saber do usuário: preferências e feedback são persistidos em `/Users/tiagomenna/.claude/projects/.../memory/`.
- Salvar em memória quando o usuário confirmar uma escolha não-óbvia ou corrigir padrão recorrente.
- **Não** salvar em memória: regras de negócio (pertencem a `docs/50-business-rules/`), estrutura de código (é derivável do repo), tarefas em andamento (pertencem a TaskList).

## 10. Sincronização de documentação (doc-sync)

A documentação em `docs/` é **canônica**. O código implementa a spec. Quando eles divergem, a doc está errada **ou** a implementação está errada — nunca "ambos estão ok". O processo abaixo evita drift.

### Regra-1: toda mudança de comportamento atualiza a doc no mesmo commit

Se você alterou regra de negócio, contrato de função pública, schema ou interface entre módulos, **obrigatório** atualizar no mesmo commit:

| Código alterado | Doc obrigatória a atualizar |
|---|---|
| `lib/db/schema/<mod>.ts` | `docs/20-domain/<mod>.md` + `docs/30-contracts/02-db-schema-conventions.md` (se mudou convenção) |
| `lib/domain/<mod>/index.ts` (interface pública) | `docs/30-contracts/07-module-interfaces.md` |
| Regra de negócio nova/alterada | `docs/50-business-rules/BR-<ID>.md` |
| Webhook handler | `docs/30-contracts/04-webhook-contracts.md` |
| Enum novo/alterado | `docs/30-contracts/01-enums.md` |
| Novo evento de timeline | `docs/30-contracts/03-timeline-event-catalog.md` |
| Nova Server Action pública | `docs/30-contracts/05-api-server-actions.md` |

### Regra-2: divergência temporária vai para MEMORY.md

Quando não dá para atualizar a doc no mesmo commit (ex: você descobriu uma divergência existente, ou a mudança é experimental), registre entrada em `MEMORY.md` §2 com flag `[SYNC-PENDING]`. Essa entrada vira tarefa explícita na próxima onda.

### Regra-3: PR review rejeita drift

PR que toca `lib/domain/*` ou `lib/db/schema/*` sem alterar doc correspondente **ou** sem entrada `[SYNC-PENDING]` em MEMORY.md deve ser recusado no review.

### Regra-4: subagent `cne-docs-sync` ao fim de cada T-ID

Ao finalizar um T-ID, despache `cne-docs-sync` (ver §11) para varrer: o arquivo de domínio reflete o código? a interface pública está alinhada? há `[SYNC-PENDING]` não-resolvida? Ele atualiza ou reporta.

## 11. Subagents customizados disponíveis

Além dos subagents nativos (`Explore`, `Plan`, `general-purpose`), o projeto tem 7 subagents customizados em `.claude/agents/`:

| Subagent | Quando invocar |
|---|---|
| `cne-schema-author` | Tarefas que criam/evoluem schema Drizzle + migration |
| `cne-domain-author` | Tarefas que implementam BR-* em `lib/domain/*` (regras puras) |
| `cne-integration-author` | Tarefas que montam adapter de webhook (signature + mapper + processor) |
| `cne-ui-author` | Tarefas de UI em `/app/(app)/<mod>` |
| `cne-test-author` | Tarefas de escrita de teste (unit/integration/E2E) |
| `cne-br-auditor` | Pré-merge em módulo sensível (offer, snapshot, refund, rbac) |
| `cne-docs-sync` | Fim de T-ID ou onda — garantir doc ↔ código alinhados |

Cada subagent tem ownership declarado — não edita fora do escopo. Carregam contexto obrigatório na ordem fixa do §3. Ver arquivos em `.claude/agents/*.md` para o prompt completo.

**Quando usar subagent nativo vs customizado:**
- **Customizado** quando a tarefa se encaixa num papel recorrente do roadmap.
- **`general-purpose`** para tarefas únicas ou exploratórias que não casam com um papel.
- **`Explore`** para busca/research sem edição.
- **`Plan`** para design de implementação antes de codar.

## 12. Conformidade de stack — obrigatório seguir, obrigatório escalar

A stack em [`docs/10-architecture/02-stack.md`](docs/10-architecture/02-stack.md) é **mandatória**. Cada item foi escolhido com justificativa explícita. Usar alternativa sem aprovação humana é proibido — mesmo que a alternativa pareça mais simples no momento.

### Itens de stack com regra de uso obrigatória

| Item | Regra | Bloqueio → escalar se |
|---|---|---|
| **shadcn/ui + Radix** | Toda UI usa componentes shadcn. Nunca edite `components/ui/*` manualmente — use o CLI: `pnpm shadcn add <name>` | shadcn CLI falha, componente não existe no shadcn, conflito de versão |
| **Drizzle ORM** | Schema e queries sempre via Drizzle. Zero SQL cru em código de aplicação (exceto migrations e RLS policies em `.sql`) | drizzle-kit não gera migration correta, query Drizzle não suporta operação necessária |
| **Supabase Auth** | Toda autenticação via Supabase Auth. Nunca implemente auth custom, JWT próprio ou session manual | integração Supabase Auth quebra, magic link não funciona, TOTP não disponível |
| **Inngest** | Toda operação assíncrona (webhooks, jobs, crons) via Inngest. Nunca `setTimeout`, `setInterval` ou job runner alternativo | Inngest SDK não instala, evento não chega ao worker |
| **Next.js App Router + Server Actions** | UI consome Server Actions. Nunca crie `/api` próprio para comunicação interna entre front e back (só `/api/webhooks/*` para entrada externa) | Server Action não funciona em determinado contexto |
| **Tailwind CSS** | Estilização 100% via Tailwind utility classes. Zero CSS-in-JS, zero módulos CSS, zero `style={{}}` inline exceto valores dinâmicos que Tailwind não suporta | Tailwind não processa classe, token de design precisa de valor não-Tailwind |
| **Vitest** | Testes unit e integration via Vitest. Nunca Jest, Mocha ou outro runner | Vitest não suporta feature necessária |
| **Playwright** | E2E via Playwright. Nunca Cypress, Selenium | Playwright falha no ambiente |
| **pnpm** | Gerenciador de pacotes. Nunca npm install, yarn add | pnpm não disponível no ambiente |

### Protocolo quando um item de stack está bloqueado

```
1. PARE — não implemente workaround silencioso.
2. Documente o bloqueio:
   - O que você tentou (comandos, versões, mensagens de erro).
   - Por que não funcionou.
3. Registre em MEMORY.md §1 com tag [STACK-BLOQUEIO].
4. CHAME O HUMANO com: "Bloqueio de stack: não consegui usar <X> porque <Y>.
   Preciso da sua decisão antes de continuar."
5. Aguarde decisão. Não avance na tarefa enquanto espera.
```

### Nunca use alternativa silenciosa

Exemplos do que **NÃO** fazer:
- ❌ `npm install` porque `pnpm` deu erro — chame o humano.
- ❌ CSS module porque Tailwind não processou a classe — chame o humano.
- ❌ `<div style={{color: '#abc'}}>` porque a cor não estava no tema — chame o humano.
- ❌ Fetch para `/api/my-endpoint` porque Server Action não funcionou — chame o humano.
- ❌ `setTimeout` porque Inngest estava offline — chame o humano.

A alternativa pode parecer razoável, mas compromete a consistência do projeto e cria dívida técnica que outros subagents irão reproduzir.

### Atualização de versão major

Trocar versão major de qualquer dependência crítica (`next`, `react`, `drizzle-orm`, `@supabase/supabase-js`, `inngest`) exige **ADR aprovado** (ver `docs/90-meta/04-decision-log.md`) e decisão explícita do humano. Patch e minor podem ser atualizados via Dependabot sem ADR.
