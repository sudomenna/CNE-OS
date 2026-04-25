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

### OQ-17 — T-8-20: Notazz outbound — suposições documentadas (Fase 1)
- Origem: `lib/integrations/notazz/send.ts`, `inngest/functions/notazz-send.ts`
- Contexto: T-8-20 implementou o stub outbound de emissão de NF. Algumas decisões foram necessárias.
- Perguntas:
  1. `unit_price` por item: Fase 1 repassa `amount` total para cada item com produto. Fase 2 deve ratear por item?
  2. `issuingIe` (Inscrição Estadual): Fase 1 não envia — o campo existe em `NotazzIssuer` mas não é populado. Notazz aceita ausência de IE?
  3. Retry count: `docs/40-integrations/04-notazz.md` define 5×, T-8-20 especificou 3×. Confirmar valor correto para Fase 1.
  4. CPF fallback via `contact_document.kind='cpf'`: suposição razoável? Alternativa: buscar direto do campo `contact.cpf`.
- Impacto: OQ-NZ-01 (NCM/CFOP), quantidade de retries, dados fiscais corretos.
- Status: aberta — implementado com campos mínimos conforme T-8-20 scope.

---

## Respondidas

*(populado conforme decisões são tomadas)*
