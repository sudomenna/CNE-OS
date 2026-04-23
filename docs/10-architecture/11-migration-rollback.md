# 11 — Migrations, versionamento e rollback de banco

Estratégia para manter código e banco **sempre em sincronia**, e como voltar a um estado anterior com segurança.

---

## 1. Princípio fundamental

> **Code commit e migration são uma unidade atômica.** Um PR que muda schema TS `lib/db/schema/*.ts` **obrigatoriamente** inclui a migration SQL correspondente no mesmo commit. Nunca separe os dois.

Isso garante que:
- `git checkout <hash>` + `pnpm db:migrate` = estado de banco correto para aquele commit.
- `git log` é o histórico canônico de mudanças de schema.
- Rollback de código implica rollback de schema — o caminho é determinístico.

---

## 2. Fluxo normal (forward)

```bash
# 1. Altere o schema TypeScript
vim lib/db/schema/contact.ts

# 2. Gere a migration SQL
pnpm db:generate
# → cria lib/db/migrations/NNNN_<kebab>.sql

# 3. Revise o SQL gerado (obrigatório — Drizzle pode gerar DDL subótimo)
cat lib/db/migrations/NNNN_<kebab>.sql

# 4. Aplique em dev
pnpm db:migrate

# 5. Commite schema + migration no mesmo commit
git add lib/db/schema/contact.ts lib/db/migrations/NNNN_<kebab>.sql
git commit -m "feat(contact): adiciona campo consent_at"
```

**Proibido:** editar migration já mergeada em `main`. Correção = nova migration.

---

## 3. Down migrations — quando e como

Drizzle não gera down migrations automaticamente. A estratégia do CNE-OS é:

### 3.1. Migrations não-destrutivas (maioria)

`ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX` não precisam de down migration. Para reverter: escreva uma nova migration que desfaz (ex.: `DROP COLUMN`). Isso é o padrão forward-only.

### 3.2. Migrations destrutivas (requer cuidado extra)

`DROP TABLE`, `DROP COLUMN`, `ALTER TYPE ... DROP VALUE`, `TRUNCATE` são **destrutivas e exigem**:

1. **ADR aprovado** antes de escrever a migration (ver `docs/90-meta/04-decision-log.md`).
2. **Arquivo `.down.sql` obrigatório** ao lado da migration:

```
lib/db/migrations/
  0042_drop-contact-legacy.sql       ← migration forward (destrutiva)
  0042_drop-contact-legacy.down.sql  ← como desfazer SE necessário
```

O `.down.sql` é executado manualmente em emergências. Ele não é executado automaticamente — é um plano de fuga documentado.

### 3.3. Convenção para o `.down.sql`

```sql
-- 0042_drop-contact-legacy.down.sql
-- Como reverter 0042_drop-contact-legacy.sql
-- Aplicar manualmente: psql $DATABASE_URL < this_file.sql

-- Recria a tabela/coluna dropada
CREATE TABLE IF NOT EXISTS contact_legacy (
  id UUID PRIMARY KEY,
  -- ...
);
```

---

## 4. Como fazer rollback completo (código + banco)

### Cenário A — Revert de feature ainda não em produção

Feature foi mergeada em `main` mas ainda não deployada.

```bash
# 1. Identifique o commit anterior ao merge
git log --oneline main | head -10

# 2. Crie branch de rollback
git checkout -b rollback/revert-feat-xyz main

# 3. Revert do commit de merge (cria novo commit de revert)
git revert --no-edit <merge-commit-hash>

# 4. Se a feature tinha migration destrutiva, aplique o .down.sql no banco de dev
#    (para migrations não-destrutivas, o banco na versão anterior está OK;
#     a coluna/tabela nova só não será mais usada pelo código revertido)
psql $DATABASE_URL < lib/db/migrations/NNNN_<feature>.down.sql

# 5. Abra PR do rollback para main
```

### Cenário B — Rollback em produção (emergência)

**Primeiro recurso: PITR (Point-in-Time Recovery) do Supabase.**

```
Supabase Dashboard → Settings → Database → Backups → Point-in-Time Recovery
→ Escolha o timestamp ANTES do deploy problemático
→ Restaure para um novo projeto de staging primeiro, valide, depois para prod
```

PITR tem granularidade de segundos. Supabase mantém histórico de 7 dias (plano Pro) ou 30 dias (plano Enterprise).

**Segundo recurso: rollback manual de schema.**

Caso o PITR não seja viável (ex.: restaurar apenas parte da mudança):

```bash
# 1. Identifique qual migration causou o problema
git log --oneline -- lib/db/migrations/

# 2. Se havia .down.sql correspondente, aplique manualmente em produção
psql $DATABASE_URL_PROD < lib/db/migrations/NNNN_<problema>.down.sql

# 3. Faça revert do código no git (ver Cenário A)

# 4. Registre o incidente em MEMORY.md §3 com causa-raiz e ação
```

**Nunca** reverter manualmente sem revert do código — banco e código ficariam fora de sincronia.

### Cenário C — Revert em desenvolvimento (branch local)

O mais comum: você testou uma migration e quer voltar ao estado anterior para continuar desenvolvendo.

**Com Supabase Branch (recomendado):**

```bash
# Cada feature branch tem sua própria branch de DB
# Simplesmente delete a branch e recrie
supabase db branch delete feat/minha-feature
supabase db branch create feat/minha-feature
# Migrations são reaplicadas do zero a partir de main
```

**Com Docker local:**

```bash
# Drop e recria o container
docker rm -f cne_postgres
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=test -e POSTGRES_DB=cne_test postgres:15-alpine
pnpm db:migrate  # aplica todas as migrations desde o início
```

---

## 5. Git tags nos limites de sprint

Ao fechar cada sprint (todos os T-IDs `completed`, CI verde, staging validado), crie uma tag anotada:

```bash
git tag -a sprint-0 -m "Sprint 0 completo — migration NNNN"
git tag -a sprint-1 -m "Sprint 1-2 completo — migration MMMM"
# ...
git push origin --tags
```

A mensagem da tag inclui o número da última migration. Isso permite restaurar código **e** banco de qualquer sprint anterior:

```bash
# Voltar para o estado do Sprint 0
git checkout sprint-0
# No banco: PITR até a data/hora da tag, ou aplicar todas as migrations
# até NNNN manualmente
```

---

## 6. Supabase Branching por feature (workflow de time)

Cada feature branch cria uma branch de DB isolada no Supabase. Isso elimina conflitos de schema entre branches em paralelo.

```
main ──────────────────────────────────────── (DB: main)
  └─ feat/inbox ──────────── (DB: feat/inbox com migrations do inbox)
  └─ feat/offer ──────────── (DB: feat/offer com migrations do offer)
```

Quando o PR fecha (merge ou abandon), a branch de DB é descartada automaticamente.

**Configuração (Sprint 0):**

```bash
supabase link --project-ref <project-ref>
# Habilitar branching no painel Supabase → Settings → Branching
# Cada git push para feature branch cria branch de DB automaticamente
```

---

## 7. Ambientes e bancos

| Ambiente | Banco | Migrations | Dados |
|---|---|---|---|
| `local dev` | Docker / Supabase local | `pnpm db:migrate` manual | seeds de dev |
| `feature branch` | Supabase branch automático | Aplicadas no PR | fixtures de teste |
| `staging` | Supabase projeto staging | Aplicadas pré-deploy (CI) | subset de prod anonimizado |
| `production` | Supabase projeto prod | Aplicadas pré-deploy (CI) | dados reais |

**CI de produção (GitHub Actions):**

```yaml
- name: Run migrations (prod)
  run: pnpm db:migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}
# Só executa se migrations tiverem sido revisadas no PR
# Deploy Vercel só promove APÓS migration verde
```

---

## 8. Regras operacionais de migration

1. **Uma PR por migration destrutiva.** Nunca agrupe `DROP COLUMN` com `ADD COLUMN` de novo módulo no mesmo PR.
2. **Revisão do SQL gerado é obrigatória.** Drizzle pode gerar `ALTER TABLE ... ADD COLUMN` seguido de `UPDATE` sem transação — revisar e wrappear em `BEGIN/COMMIT` quando necessário.
3. **Migrations são imutáveis após merge em `main`.** Erro descoberto depois = nova migration corretora.
4. **Toda migration destrutiva tem `.down.sql`.** Subagent `cne-schema-author` é responsável por criar o par.
5. **Nunca `drizzle-kit drop` em produção** sem aprovação explícita do humano (ver `CLAUDE.md §5` — comandos proibidos).
6. **Registre qualquer migration não-trivial em MEMORY.md §1** (decisão operacional) com data e o que foi feito.

---

## 9. Referências cruzadas

- `docs/10-architecture/03-data-layer.md §2` — fluxo de geração de migration
- `docs/30-contracts/02-db-schema-conventions.md` — convenções de naming e estrutura
- `CLAUDE.md §5` — comandos proibidos sem aprovação explícita
- `MEMORY.md §1` — log de decisões operacionais de migration
