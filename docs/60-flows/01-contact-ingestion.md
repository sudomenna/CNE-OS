# FLOW-01: Ingestão de contato

## Gatilho / pré-condições

Qualquer superfície que introduza um contato no sistema invoca este fluxo:

- submissão de landing page / formulário de captura;
- mensagem inbound em qualquer canal (WhatsApp, Instagram DM, e-mail) — delegado por [`FLOW-02`](./02-omnichannel-message.md);
- webhook de checkout/provedor (Digital Guru) — delegado por [`FLOW-05`](./05-external-sale-ingest.md);
- importação manual (CSV) por operador;
- criação manual via UI de contatos.

Pré-condição: payload contém pelo menos um identificador (`cpf`, `phoneE164`, `email`). Input só com `fullName` é rejeitado (ver `OQ-IDENTITY-03`).

## Atores

- humano: operador (para importação manual / criação direta).
- sistema: handler da Server Action / rota de ingestão; módulo `MOD-CONTACT`.
- integração: provedor de origem (`landing_form`, `checkout`, `messaging_channel`, `import`, `crm_integration`).

## Passos

1. **Receber payload** com `{ cpf?, phoneE164?, email?, fullName?, origin, sourceRef? }`. Registrar `correlation_id` do request.
2. **Normalizar** entradas (pura):
   - `cpf` → 11 dígitos, sem máscara; validar DV (dígito verificador). CPF inválido ⇒ erro `E-01`.
   - `phoneE164` → `+<cc><ddd><numero>`; validar formato via `libphonenumber`. Inválido ⇒ erro `E-02`.
   - `email` → lowercase + trim; validar RFC; normalizar domínio. Inválido ⇒ erro `E-03`.
   - `fullName` → trim + normaliza espaços.
3. **Abrir transação SQL** com isolamento `SERIALIZABLE` (evita corrida entre dois webhooks criando duplicatas do mesmo CPF).
4. **Chamar `resolveContactIdentity(input)`** — função pura de [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md); retorna `{ action, contactId, applied?, issues }`.
5. **Aplicar resolução**:
   - `action='create'` → INSERT em `contact`, `contact_phone`, `contact_email`, `contact_document`; `TE-CONTACT-CREATED`.
   - `action='update'` → aplicar `AppliedChange[]` na ordem canônica (ver BR-IDENTITY); para cada campo crítico mutado, `TE-CONTACT-UPDATED`.
   - `action='noop'` → nenhuma escrita em `contact`.
6. **Persistir pendências** retornadas em `issues` como `contact_issue` com `status='open'` e emitir `TE-CONTACT-ISSUE-OPENED` por linha.
7. **Associar contexto de origem quando presente no payload**:
   - `brand_id` → registrar em `contact_brand` (n-n).
   - `funnel_id` → delegar a [`FLOW-03`](./03-funnel-opportunity-lifecycle.md) (`enterFunnel`).
   - `campaign_id`/`creative_id` → persistir em `funnel_entry.entry_campaign_id`/`entry_creative_id` via FLOW-03.
8. **Commit.** Fora da transação, enfileirar side-effects não-críticos (envio de confirmação, sincronização Brevo).

## Pós-condições

- Existe exatamente uma linha viva em `contact` correspondente ao input (ou já existia, em `noop`).
- Identificadores normalizados estão em `contact_phone`/`contact_email`/`contact_document` com os `status` corretos (`primary`/`alternative`/`secondary`).
- Zero ou mais `contact_issue` `open` foram criadas.
- `timeline_event` contém os eventos da operação; todos com `source='MOD-CONTACT'`.
- Se `funnel_id` foi informado, existe `funnel_entry` ativa correspondente.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | CPF com DV inválido | rejeitar antes do DB com `InvalidCpfError` | operador corrige na origem; se webhook, payload vai a DLQ (ver [`FLOW-12`](./12-webhook-reprocess.md)) |
| E-02 | telefone fora de E.164 | `InvalidPhoneError` | idem |
| E-03 | e-mail inválido | `InvalidEmailError` | idem |
| E-04 | input sem nenhum identificador | `InsufficientIdentityError` (proposta `OQ-IDENTITY-03`) | UI bloqueia; import anota linha |
| E-05 | contato bate `status='blocked'` (blacklist) | registrar tentativa em `contact_ingest_attempt`; não atualizar dado; emitir evento de auditoria | operador avalia desbloqueio |
| E-06 | corrida detectada (SERIALIZATION_FAILURE) | retry automático do Inngest com backoff | até 3 tentativas |
| E-07 | `contact_issue` já aberto para o mesmo par input↔contato | idempotente: não duplica issue; apenas atualiza `payload` e `updated_at` | — |

## Regras referenciadas

- [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md) — autoridade da resolução.
- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md) — não aplicada aqui (ingestão cria `lead`); delegada ao `FLOW-05` quando há compra.
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md) — emissão atômica.
- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md) — quando `origin='integration'`.

## Eventos emitidos

Ordem dentro da transação:

1. `TE-CONTACT-CREATED` **ou** `TE-CONTACT-UPDATED` (nunca ambos no mesmo call).
2. `TE-CONTACT-ISSUE-OPENED` (0..N).
3. `TE-FUNNEL-ENTERED` (opcional, quando há `funnel_id` — emitido por MOD-FUNNEL, não por este fluxo).

## Observabilidade

- Métricas:
  - `contact_ingest_total{origin, outcome}` (outcome: `created|updated|noop|rejected`).
  - `contact_ingest_latency_ms{origin}`.
  - `contact_issue_opened_total{kind}`.
- Logs estruturados (`correlation_id`, `contact_id?`, `origin`, `sourceRef`): um log por passo, campo `flow='FLOW-01'`.
- Alertas:
  - Sentry: picos de `InvalidCpfError`/`InvalidPhoneError` acima de 5% (indica bug na origem).
  - Axiom: dashboard "ingestão por origem × outcome × marca".

## Casos de teste E2E obrigatórios

1. **create-landing-form-happy**
   - Given: landing form submete `{ cpf: válido novo, phoneE164, email, origin:'landing_form' }`.
   - When: Server Action executa.
   - Then: `contact` criado; `TE-CONTACT-CREATED` emitido; resposta 200 em < 500ms.

2. **update-por-cpf-com-telefone-conflito**
   - Given: C1 existe com CPF X e telefone A.
   - When: webhook traz CPF X + telefone B (caso #4 de BR-IDENTITY).
   - Then: telefone B entra como `primary`, A rebaixado; `contact_issue kind='phone_conflict'` aberta; 2 eventos emitidos.

3. **create-sem-cpf-email-duplicado-abre-pendencia** (caso #8)
   - Given: C1 tem `e-mail@x.com`; input sem CPF traz tel novo + mesmo e-mail.
   - When: ingesta.
   - Then: C2 criado; `contact_issue kind='email_duplicate' relatedContactId=C1`; nenhum merge automático.

4. **noop-idempotente-em-reentrega**
   - Given: webhook `origin='integration'` já processado com `external_event_id='evt_1'`.
   - When: reentrega mesma.
   - Then: `webhook_log` detecta duplicata; nenhuma nova escrita em `contact`; 200 OK.

5. **corrida-dois-webhooks-mesmo-cpf**
   - Given: duas chamadas concorrentes com mesmo CPF novo.
   - When: ambas executam.
   - Then: 1 `contact` criado; a segunda resolve como `noop` (ou `update` vazio); não há duplicata.

6. **blacklist-bloqueia-update**
   - Given: C1 `status='blocked'`.
   - When: ingestão tenta atualizar nome.
   - Then: nenhuma alteração em `contact`; linha registrada em `contact_ingest_attempt` para auditoria.

## Open Questions

- `OQ-FLOW-01-01` — ingestão em batch via import CSV: transação por linha (simples, lenta) ou batch com retry por linha? Proposta: batch de 500 com savepoints.
- `OQ-FLOW-01-02` — associação a marca: exigir `brand_id` quando origem for `landing_form` ou permitir `NULL` até classificação manual? Cruz com `OQ-BR-INBOX-02`.
