# Convenções da documentação

Como escrever e manter documentos neste repo. Agentes e humanos devem seguir.

## 1. Princípios

1. **Um conceito por arquivo.** Se um doc passa de ~400 linhas, quebrar.
2. **Templates fixos por tipo.** Agregado, fluxo, BR, integração, sprint — cada um tem template.
3. **IDs rastreáveis.** Toda regra, evento, fluxo, tarefa tem ID.
4. **Tabelas > prosa** para regras complexas.
5. **Open Questions inline** + consolidadas em `03-open-questions-log.md`.
6. **Nunca remover; deprecar.** Conteúdo obsoleto vira `## DEPRECATED` no topo da seção ou arquivo.

## 2. Templates

### 2.1. Agregado de domínio (`/20-domain/*.md`)

```
# <Agregado>  (Módulo MOD-<NAME>)

## 1. Finalidade
## 2. Ownership (paralelização)
   - Arquivos que POSSUI:
   - Arquivos que LÊ (read-only):
   - Interfaces públicas expostas:
## 3. Entidades e campos (tabela + DDL sketch)
## 4. Relações (ASCII)
## 5. Invariantes (INV-MOD-NN)
## 6. Estados e transições
## 7. Regras de negócio referenciadas (BR-IDs)
## 8. Eventos de timeline emitidos (TE-IDs)
## 9. Fluxos relacionados (FLOW-IDs)
## 10. Casos de teste obrigatórios
## 11. Open Questions
```

### 2.2. Fluxo (`/60-flows/*.md`)

```
# FLOW-<NUM>: <nome>

## Gatilho / pré-condições
## Atores
## Passos (numerados, determinísticos)
## Pós-condições
## Caminhos de erro
## Regras referenciadas (BR-IDs)
## Eventos emitidos (TE-IDs)
## Observabilidade
## Casos de teste E2E obrigatórios
## Open Questions
```

### 2.3. Business rule (`/50-business-rules/BR-*.md`)

```
# BR-<ID>: <título curto>

## Enunciado
## Motivação
## Escopo (módulos afetados, entidades)
## Enforcement (marcar uma ou mais camadas autoritativas)
   - [ ] DB constraint (SQL)
   - [ ] DB trigger
   - [ ] Função de domínio pura (TS signature)
   - [ ] Guard em Server Action
   - [ ] Guard em UI
## Contrato TS (quando função)
## DDL / constraint SQL (quando DB)
## Tabela de decisão (quando aplicável)
## Casos de teste (Given/When/Then com inputs e outputs exatos, ≥3)
## Rastreabilidade
   - Teste esperado: tests/unit/<path>
   - Referenciada em: <lista>
## Open Questions
```

### 2.4. Integração (`/40-integrations/*.md`)

```
# Integração <nome>

## Papel
## Eventos consumidos (tabela: external_event → ação interna → BR → TE → idempotency_key)
## Eventos emitidos
## Mapeamento canônico (tabela: external_field → internal_field → transformação)
## Idempotência / retry / DLQ
## Credenciais e configuração (env vars)
## Limitações conhecidas
## Casos de teste
## Open Questions
```

### 2.5. Sprint (`/80-roadmap/*.md`)

```
# Sprint N — <nome>

## Objetivo
## Entregáveis (outcomes)
## Tarefas
| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Critério de aceite |
## DoD do sprint
## Riscos
```

## 3. Estilo de escrita

- **Imperativo.** "Registrar" > "deveria registrar". "Persistir em X" > "é interessante persistir".
- **Específico.** Evite "adequadamente", "de forma apropriada", "quando necessário" — especifique.
- **Sem redundância entre docs.** Se a regra está em BR-X, o módulo referencia o ID, não reescreve.
- **Português PT-BR, exceto termos técnicos consagrados** (`snapshot`, `webhook`, `payload`).
- **Abreviações explicadas no primeiro uso**, depois livre.

## 4. Como adicionar um doc novo

1. Verificar se o conceito não cabe em doc existente (caberia? expandir o existente).
2. Escolher pasta correta (`20-domain/` se é agregado, `60-flows/` se é fluxo, etc.).
3. Copiar template acima.
4. Criar entrada no `README.md` da pasta.
5. Registrar IDs novos em `02-id-registry.md`.
6. Se afeta contratos, propor mudança em tarefa **serial**.

## 5. Como mudar um doc existente

- Mudança pequena (tipo, clarificação): edit direto, commit.
- Mudança em BR que muda comportamento: atualizar testes + módulos consumidores + ADR se não-óbvio.
- Mudança em contrato (`30-contracts/*`): **tarefa serial dedicada**, nunca em paralelo.

## 6. Linkagem

- Sempre usar paths relativos (`../50-business-rules/BR-IDENTITY.md`).
- Âncoras minúsculas com hífens: `#5-invariantes`.
- Não linkar para o PRD arquivado em contexto normativo — apenas como referência histórica.
