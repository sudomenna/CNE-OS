# CNE-OS — Sistema Operacional da CNE Educação

Sistema central multi-marca da CNE Educação: CRM global, inbox omnichannel, marketing/funis, motor comercial de ofertas com snapshots imutáveis e integrações externas.

## Leia primeiro

- **Agentes codificadores:** ler [`AGENTS.md`](./AGENTS.md) (agente-agnóstico) ou [`CLAUDE.md`](./CLAUDE.md) (Claude Code) antes de editar qualquer arquivo.
- **Humanos / novos devs:** começar por [`docs/README.md`](./docs/README.md) — índice mestre da documentação spec-driven.
- **Produto:** [`docs/00-product/`](./docs/00-product/).
- **Domínio e regras:** [`docs/20-domain/`](./docs/20-domain/) + [`docs/50-business-rules/`](./docs/50-business-rules/).
- **Roadmap / sprints:** [`docs/80-roadmap/`](./docs/80-roadmap/).

## Stack (pinada)

- Next.js 15 (App Router, Server Actions) + TypeScript
- Supabase (Postgres + Auth + Realtime + Storage + RLS + pgvector)
- Drizzle ORM
- Inngest (jobs e webhooks)
- shadcn/ui + Tailwind + Radix
- Vitest + Playwright
- Sentry + Axiom + Vercel

## Princípios

1. O sistema é a fonte única da verdade; integrações se adaptam ao modelo interno.
2. Compras são imutáveis — snapshot em `jsonb` append-only.
3. O contato é a entidade central; toda jornada é lida a partir dele.
4. Módulos têm ownership declarado; agentes não editam fora do seu módulo.
5. Ambiguidade nunca é resolvida com invenção: registrar em `docs/90-meta/03-open-questions-log.md` e perguntar.

## Estado

Pré-código. Documentação spec-driven em construção. Implementação começa após Pass 3 concluído e Sprint 0 do roadmap aprovado.
