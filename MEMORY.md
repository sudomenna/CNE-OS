# MEMORY.md — Diário vivo do CNE-OS

Este arquivo é o diário operacional do projeto. Diferente dos ADRs (que capturam decisões arquiteturais formais em `docs/90-meta/04-decision-log.md`) e das OQs (que capturam dúvidas em aberto em `docs/90-meta/03-open-questions-log.md`), este arquivo é **append-only** e registra o que aconteceu na prática: decisões operacionais, divergências doc ↔ código, bugs corrigidos e handoffs de sessão.

## Como usar

1. **Nunca edite entradas antigas.** Se uma decisão mudou, adicione nova entrada referenciando a anterior.
2. **Toda entrada tem cabeçalho** com data ISO (`YYYY-MM-DD`), autor (`@humano` ou `@<subagent-name>`) e tag da seção.
3. **Mantenha entradas curtas.** Se precisar detalhar, linke para o arquivo (ADR, doc de domínio, PR).
4. **Ordem cronológica reversa por seção** (mais recente no topo de cada seção).

## Seções

### §1. Decisões operacionais

Decisões do dia-a-dia que não merecem ADR formal mas precisam ficar registradas para quem chega depois.

<!-- Exemplo:
#### 2026-04-23 · @humano · branch naming
Padrão de nome de branch: `<sprint>/<t-id>-<slug-curto>`. Ex: `sprint-0/t-0-01-bootstrap-pkg`.
Motivo: facilita filtrar PRs por sprint no GitHub Projects.
-->

#### 2026-04-23 · @cne-schema-author · T-0-05 · [STACK-BLOQUEIO] drizzle-kit version mismatch
Problema: `pnpm db:generate` e `pnpm db:push` falham com "This version of drizzle-kit requires newer version of drizzle-orm".
Versões instaladas: `drizzle-orm@0.35.3` + `drizzle-kit@0.27.2`. O drizzle-kit 0.27.x é incompatível com drizzle-orm 0.35.x.
Workaround adotado em T-0-05: migration SQL escrita manualmente em `lib/db/migrations/0001_organization_brand_legal_entity.sql`, copiada para `supabase/migrations/20260423000001_organization_brand_legal_entity.sql` e aplicada via `supabase db push --linked`.
Acao necessaria (bloqueante para T-0-06+): upgrade coordenado de `drizzle-orm` e `drizzle-kit` para versoes compativeis. Requer decisao humana (mudanca de minor em dep critica).

#### 2026-04-23 · @humano · bootstrap da fundação
Inicializado o projeto com `.gitignore`, `MEMORY.md`, 7 subagents customizados, matriz de testes por sprint, ADRs 10-16 propostos (pendente aprovação), e refinos de doc para paralelismo. Repo ainda pré-código; Sprint 0 será plano separado.

---

### §2. Divergências doc ↔ código

Toda vez que o código precisar divergir da spec (temporariamente ou não), registrar aqui. Flag `[SYNC-PENDING]` indica que a doc ainda não foi atualizada; `[SYNCED]` indica que doc e código estão alinhados.

**Formato:**
```
#### YYYY-MM-DD · @autor · [SYNC-PENDING|SYNCED] · <módulo>
Doc afetada: docs/<path>.md
Divergência: <o que o código faz que a doc não reflete>
Motivo: <por que divergiu>
Ação: <atualizar doc em <quando> | deliberadamente mantido>
```

#### 2026-04-23 · @cne-domain-author · [SYNC-PENDING] · MOD-TIMELINE
Doc afetada: docs/30-contracts/07-module-interfaces.md
Divergência: `lib/timeline/emit.ts` expõe interface pública `emitTimelineEvent` + `ModuleSource` + `TimelineEventInput` que ainda não está listada na seção MOD-TIMELINE de 07-module-interfaces.md.
Motivo: T-0-13 criou o módulo de domínio; atualização de 07-module-interfaces.md é tarefa serial (CLAUDE.md §2 regra 6).
Ação: atualizar docs/30-contracts/07-module-interfaces.md na próxima onda serial antes do Sprint 1.

---

### §3. Bugs corrigidos

Entradas curtas por bug corrigido. Não é lista de todos os bugs — é a lista dos que valem a pena lembrar (aqueles onde a causa-raiz foi não-óbvia ou onde o padrão pode se repetir).

**Formato:**
```
#### YYYY-MM-DD · @autor · <módulo>
Sintoma: <o que estava errado>
Causa-raiz: <por que estava errado>
Fix: <arquivo e abordagem>
Prevenção: <teste adicionado, regra de lint, etc.>
```

<!-- Nenhuma entrada ainda -->

---

### §4. Sessão / Handoff

Log por sessão de trabalho. Atualizado no **fim** de cada sessão relevante. Serve para quem (humano ou agente) pegar o trabalho depois saber de onde continuar.

**Formato:**
```
#### YYYY-MM-DD · @autor · sessão <nome>
Entregue: <o que foi finalizado e mergeado>
Em andamento: <o que ficou no meio>
Pendente: <o que precisa ser feito na próxima sessão>
Aprendizados: <o que surpreendeu, o que mudaria>
```

#### 2026-04-23 · @claude-code · fundação pré-Sprint-0
**Entregue:**
- `.gitignore`, `MEMORY.md` (este arquivo)
- 7 subagents customizados em `.claude/agents/`
- `docs/80-roadmap/98-test-matrix-by-sprint.md` (matriz de testes)
- `docs/80-roadmap/97-ownership-matrix.md` (mapa de ownership T-ID → arquivos)
- ADRs 10-16 propostos em `docs/90-meta/04-decision-log.md`
- `scripts/verify-wave.sh` (verificação inter-ondas)
- Atualizações em `CLAUDE.md` (§10 doc-sync, §11 subagents) e `docs/90-meta/05-subagent-playbook.md` (DoD + TaskList template)
- Diagrama ASCII de deps em `docs/10-architecture/09-module-boundaries.md`

**Em andamento:** nada.

**Pendente:**
- Aprovação dos ADRs 10-16 pelo humano (viram `accepted` e fecham as OQs correspondentes).
- Plano detalhado de Sprint 0 (18 T-IDs, 7 ondas) como próxima rodada.
- Criar repositório remoto no GitHub e `git remote add origin`.

**Aprendizados:**
- A documentação já estava muito madura — os GAPs reais eram operacionais (git, MEMORY, subagents, matriz de testes), não conceituais.
- OQs bloqueantes de paralelização (IFACE-01, IFACE-03, ENUM-01/02/03) precisavam de decisão antes de qualquer onda — resolvidas via ADRs propostos.
