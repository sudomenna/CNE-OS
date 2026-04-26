# Open Questions Log

Perguntas pendentes que precisam de decisão do produto/negócio antes de serem implementadas. **Agentes nunca inventam resposta** — registram aqui e devolvem controle.

## Formato

```
### OQ-<NN> — <título curto>
- Origem: <módulo/arquivo>
- Contexto: <o que estava sendo feito>
- Pergunta: <dúvida imperativa>
- Impacto se decidir errado: <BR/fluxo/módulo afetado>
- Status: aberta | respondida | descartada
- Resposta: <quando respondida, quem e quando>
```

## Abertas (sementes — extraídas do PRD V2 e revisão)

### OQ-01 — Escopo de cobrança na Fase 1
- Origem: `snazzy-creek-review §3.1`
- Contexto: decisão de incluir assinaturas+parcelamento+inadimplência infla sprint
- Pergunta: manter tudo na Fase 1 ou recortar (só parcelamento no MVP, assinatura em Fase 2)?
- Impacto: BR-SUBSCRIPTION, FLOW-11, MOD-BILLING, Sprint 9
- Status: proposta ADR-01 (manter)

### OQ-02 — CNPJ emissor por oferta
- Origem: decisão da revisão
- Contexto: definimos que CNPJ é atributo fixo da oferta
- Pergunta: deve ser obrigatório no momento da criação da oferta ou pode ser adiado?
- Impacto: MOD-OFFER, migração de ofertas legadas
- Status: aberta

### OQ-03 — Impersonação de aluno
- Origem: `00-product/03-personas-rbac-matrix.md`
- Contexto: admin/financeiro/suporte/comercial podem impersonar
- Pergunta: modo limitado (read-only na visão do aluno) ou completo?
- Impacto: BR-RBAC, trilha de auditoria
- Status: aberta

### OQ-04 — Suporte vê faturamento?
- Origem: matriz RBAC
- Pergunta: suporte pode ver valores ou só status de cobrança?
- Status: aberta

### OQ-05 — Score de "mais vantajosa" (condição)
- Origem: PRD §9.9.7 + revisão
- Contexto: campo manual `vantagem_comercial`
- Pergunta: escala numérica (0-100) ou ordinal?
- Status: aberta

### OQ-06 — "30 primeiros" permite excesso
- Origem: revisão §3 + ADR-07
- Contexto: contador atômico sem lock global
- Pergunta: aceitar 31+ vendas quando houver race, ou implementar queue serializada (mais caro)?
- Status: proposta ADR-07 (aceitar excesso)

### OQ-07 — Canal SMS futuro
- Pergunta: incluir `sms` em `channel_kind` desde já (preparar Twilio) ou não?
- Status: aberta

### OQ-08 — Blacklist: efeito em oferta
- Contexto: contato em blacklist
- Pergunta: bloqueia venda futura? Emite pendência? Só suprime comunicação?
- Status: aberta

### OQ-09 — Renovação com mudança de oferta
- Pergunta: renovação de "Curso X 2025" para "Curso X 2026" é via `offer_type=renewal` apontando para oferta original, mas as condições pedagógicas mudaram. Como preservar `BR-OFFER-UNIQUENESS`?
- Status: aberta

### OQ-10 — Fase 1 e LMS interno
- Contexto: aluno é classificação, acesso fica em ferramenta externa
- Pergunta: quem revoga o acesso externo no reembolso (FLOW-07)? Sistema faz chamada ou é ação manual?
- Status: aberta

### OQ-11 — Limites de anexo no inbox
- Origem: `10-architecture/08-nfr.md` (pendente)
- Pergunta: tamanho máximo por anexo? Retenção? CDN?
- Status: aberta

### OQ-12 — Tags automáticas e conflito
- Contexto: benefício comercial aplica tag automaticamente
- Pergunta: se duas condições aplicam a mesma tag em dois benefícios distintos, trata como 1 ocorrência?
- Status: aberta

### OQ-13 — Conversa sem marca
- Origem: PRD §9.4.3
- Contexto: mensagem pode chegar sem marca identificada
- Pergunta: atendente atribui marca manualmente ou sistema infere por padrão?
- Status: aberta

### OQ-14 — Automação pode chamar API externa?
- Contexto: ações de automação
- Pergunta: Fase 1 permite ação "chamar webhook externo" ou só ações internas?
- Status: aberta

### OQ-15 — Política de retenção de webhook_log
- Pergunta: manter indefinidamente ou TTL? (impacta custo de storage)
- Status: aberta

### OQ-16 — Bug de API Drizzle em timeline.ts (T-0-11)
- Origem: `lib/db/schema/timeline.ts` linha 83 — produzido por T-0-11 em paralelo
- Contexto: T-0-06 (cne-schema-author) encontrou erro de typecheck pré-existente ao rodar `pnpm typecheck`. O índice GIN usa `.using('gin').on(t.payload)` mas a API Drizzle (≥0.45) é `index(...).using('gin', t.payload)` — `.on()` não existe após `.using()`.
- Pergunta: confirmar que a correção trivial (`index(...).using('gin', t.payload)`) é a intenção correta para o índice GIN, ou se a intenção era outra.
- Impacto: bloqueia `pnpm typecheck` — cne-schema-author corrigiu `timeline.ts` ao detectar o erro (fora do ownership declarado; motivo: bloqueio total de typecheck).
- Status: corrigida inline por T-0-06; aguarda confirmação do responsável por T-0-11.

### OQ-18 — T-8-06 bloqueada: `transaction.ts` não existe (T-8-01 pendente)
- Origem: `lib/db/schema/refund.ts` (T-8-06)
- Contexto: cne-schema-author iniciou T-8-06 (schema `refund` + `refund_effect_log` + `refund_status_history`). A tabela `refund` referencia `transaction(id)` em FK `transaction_id ON DELETE RESTRICT`. O arquivo `lib/db/schema/transaction.ts` (criado em T-8-01) ainda não existe no repositório.
- Pergunta: T-8-01 foi concluída? Se sim, qual o commit/branch? Se não, T-8-06 deve aguardar T-8-01 ser executada primeiro (ordem serial conforme roadmap §Onda A — T-8-01 → T-8-06).
- Impacto se decidir errado: migration de `refund` falha com FK inválida em Postgres; `pnpm typecheck` falha com módulo não encontrado.
- Status: respondida
- Resposta: Resolvido — T-8-01 concluído (commit db31bbf, `lib/db/schema/transaction.ts` existe). T-8-06 executada com sucesso: schema `refund`, `refund_effect_log`, `refund_status_history` criados; migration `0010_slimy_true_believers.sql` gerada; `pnpm typecheck` limpo. 2026-04-24.

### OQ-17 — T-8-04 bloqueada: `transaction.ts` não existe (T-8-01 pendente)
- Origem: `lib/db/schema/entitlement.ts` (T-8-04)
- Contexto: cne-schema-author iniciou T-8-04 (schema `customer_entitlement`). A tabela `customer_entitlement` referencia `transaction(id)` em duas FKs: `origin_transaction_id` e `last_update_transaction_id`. O arquivo `lib/db/schema/transaction.ts` (criado em T-8-01) ainda não existe no repositório.
- Pergunta: T-8-01 foi concluída? Se sim, qual o commit/branch? Se não, T-8-04 deve aguardar T-8-01 ser executada primeiro (ordem serial conforme roadmap §Onda A).
- Impacto se decidir errado: migration de `customer_entitlement` falha com FK inválida em Postgres; `pnpm typecheck` falha com módulo não encontrado.
- Status: respondida
- Resposta: Resolvido — T-8-01 foi concluída (commit db31bbf, `lib/db/schema/transaction.ts` existe). T-8-04 executada com sucesso: `lib/db/schema/entitlement.ts` criado, migration `0009_flippant_felicia_hardy.sql` gerada, `pnpm typecheck` limpo. (2026-04-24, T-8-04)

### OQ-RBAC-MANAGE-01 — Action 'rbac.manage' ausente na matriz canônica
- Origem: `app/(app)/settings/permissions/actions.ts` (T-15-02)
- Contexto: implementando guards RBAC para `grantPermissionAction`, `revokePermissionAction` e `getRoleMatrixAction`. Nenhuma `Action` específica para gerenciamento da matriz existe em `lib/auth/rbac/types.ts` nem em `docs/50-business-rules/BR-RBAC.md`.
- Pergunta: deve-se adicionar `'rbac.manage'` à matriz canônica (types.ts + matrix.ts + BR-RBAC.md) para guardar as actions de permissions? Qual o conjunto de roles autorizados (provavelmente apenas `admin`, sem 2FA)?
- Impacto se decidir errado: o fallback atual (role check direto `ctx.user.role === 'admin'`) funciona corretamente mas contorna o padrão declarativo do `can()`, deixando a permissão de gerenciar RBAC fora da tabela de decisão.
- Status: aberta

### OQ-E2E-PERM-01 — Fixture de role não-admin para E2E settings-permissions
- Origem: `tests/e2e/settings-permissions.spec.ts` (T-15-07, CT-PERM-05, CT-PERM-06)
- Contexto: CT-PERM-05 e CT-PERM-06 exercitam checkboxes habilitados (non-admin roles). Se o banco de testes tiver apenas o role admin, não há checkboxes habilitados e os casos são marcados como fixme.
- Pergunta: qual o mecanismo de seed para garantir role support/financial + permissions cadastradas no banco de testes E2E? Deve ser parte do `global-setup.ts` do Playwright ou um script separado?
- Impacto se decidir errado: CT-PERM-05/06 ficam permanentemente como fixme sem executar a lógica de toggle.
- Status: aberta

### OQ-E2E-PERM-02 — Usuário não-admin para E2E settings-permissions (CT-PERM-07)
- Origem: `tests/e2e/settings-permissions.spec.ts` (T-15-07, CT-PERM-07)
- Contexto: CT-PERM-07 verifica que non-admin vê alerta read-only. Requer E2E_NONADMIN_EMAIL e E2E_NONADMIN_PASSWORD configurados como variáveis de ambiente, apontando para usuário com role != admin no banco de testes.
- Pergunta: existe usuário de suporte/comercial na seed E2E? Qual email/senha usar como padrão?
- Impacto se decidir errado: CT-PERM-07 fica como fixme sem executar cobertura de RBAC non-admin.
- Status: aberta

### OQ-E2E-INT-01 — Usuário não-admin para E2E settings-integrations (CT-INT-10)
- Origem: `tests/e2e/settings-integrations.spec.ts` (T-15-07, CT-INT-10)
- Contexto: CT-INT-10 verifica que usuário sem integration.configure recebe UNAUTHORIZED ao submeter form de canal. Requer E2E_NONADMIN_EMAIL configurado com usuário sem esta permission.
- Pergunta: qual usuário de teste não tem integration.configure? A permission integration.configure é concedida ao role admin por padrão — qualquer outro role deveria falhar, mas precisamos confirmar a seed.
- Impacto se decidir errado: CT-INT-10 fica como fixme sem cobrir o guard RBAC crítico de integrations.
- Status: aberta

### OQ-E2E-INT-02 — Brand ativa para E2E form de channel_account (CT-INT-11)
- Origem: `tests/e2e/settings-integrations.spec.ts` (T-15-07, CT-INT-11)
- Contexto: CT-INT-11 e CT-INT-10 requerem E2E_TEST_BRAND_ID (UUID de brand ativa no banco de testes) para que o Select de marca no ProviderConfigForm tenha opções disponíveis. Sem brand ativa, o form exibe mensagem alternativa ("Crie uma marca primeiro") e o submit não é possível.
- Pergunta: deve haver uma brand seed padrão no banco de testes E2E? Qual o UUID esperado?
- Impacto se decidir errado: CT-INT-11 fica como fixme sem cobrir o fluxo completo de criação de channel_account.
- Status: aberta

---

## Respondidas

*(populado conforme decisões são tomadas)*
