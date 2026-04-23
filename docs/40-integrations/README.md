# 40 — Integrações

Um arquivo por provedor externo. Formato uniforme: papel, eventos consumidos/emitidos, mapeamento canônico, idempotência/retry/DLQ, credenciais.

| Arquivo | Provedor | Papel |
|---|---|---|
| `01-digital-guru.md` | Digital Guru | Checkout + cobrança (fonte principal de venda externa) |
| `02-brevo.md` | Brevo | Envio de e-mail + fonte de eventos de engajamento |
| `03-whatsapp-oficial.md` | WhatsApp API Oficial | Inbox + envio outbound |
| `04-notazz.md` | Notazz | Emissão fiscal |
| `05-analytics.md` | Analytics (GA4 / outro) | Rastreamento + leitura gerencial |

## Diretrizes (válidas para todas)

1. **Modelo canônico interno prevalece** — ferramentas externas são adaptadas, não o contrário.
2. **Idempotência obrigatória** via `webhook_log.external_event_id UNIQUE`.
3. **Eventos não mapeáveis** vão para DLQ — nunca são descartados.
4. **Retry com backoff exponencial** (Inngest default), máximo 5 tentativas, depois DLQ.
5. Credenciais via env vars, nunca hardcoded. Rotação documentada.
6. Todo adaptador vive em `/lib/integrations/<provider>/` e expõe: `handleWebhook(payload)`, `mapToInternal(payload)`, fixtures de teste.

**Status:** stub em Pass 1. Conteúdo completo no Pass 3.
