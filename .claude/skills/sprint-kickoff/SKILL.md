---
name: sprint-kickoff
description: Carrega contexto do sprint atual, verifica baseline de testes e lista T-IDs parallel-safe prontos para execução na primeira onda
---

Você está iniciando um novo sprint no CNE-OS. Execute os passos abaixo em ordem.

## Passo 1 — Carregar contexto

Leia os seguintes arquivos nesta ordem:
1. `AGENTS.md`
2. `CLAUDE.md`
3. `.claude/projects/-Users-tiagomenna-Projetos-CNE-OS/memory/MEMORY.md` (ou `/Users/tiagomenna/.claude/projects/-Users-tiagomenna-Projetos-CNE-OS/memory/MEMORY.md`)
4. O arquivo de roadmap do sprint atual em `docs/80-roadmap/` (identificar pelo §5 do MEMORY.md qual é o próximo sprint)

## Passo 2 — Verificar baseline

Execute e reporte o resultado:

```bash
pnpm typecheck && pnpm test
```

- Se typecheck falhar: liste os erros e **pare** — não avance até o humano resolver.
- Se testes falharem: liste os testes falhando e **pare**.
- Se tudo verde: confirme "Baseline limpo: X testes passando".

## Passo 3 — Mapear T-IDs da primeira onda

A partir do arquivo de roadmap do sprint:
1. Liste todos os T-IDs com `parallel-safe: yes` e sem `depends-on` não concluídos.
2. Liste os T-IDs seriais (sem `parallel-safe: yes`) que devem ir na primeira onda (os sem dependências).
3. Identifique a primeira onda sugerida no rodapé do roadmap (seção "Ondas de paralelização sugeridas").

## Passo 4 — Propor plano

Apresente ao humano:
- **Baseline**: status de typecheck e testes
- **Sprint atual**: nome e objetivo
- **Primeira onda**: T-IDs a despachar em paralelo, com subagent recomendado por T-ID (conforme tabela em CLAUDE.md §11)
- **Dependências críticas**: o que bloqueia cada onda subsequente

Aguarde aprovação do humano antes de despachar qualquer subagent.
