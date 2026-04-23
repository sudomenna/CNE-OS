# 08 — Non-Functional Requirements (NFR)

SLA, RPO/RTO, performance, storage, limites, segurança e LGPD. Contratos mensuráveis e verificáveis.

---

## 1. SLA

| Serviço | SLA Fase 1 | Medida |
|---|---|---|
| Front web (`/app/(app)/*`) | 99.5% mensal | uptime externo + Vercel Analytics |
| Inbox (crítico) | 99.5% mensal | tempo útil para responder conversa |
| Webhooks (entrada) | 99.9% mensal | `POST /api/webhooks/*` retorna 2xx para payload válido |
| Realtime CDC | 99.5% mensal | dependência Supabase |
| Jobs / Inngest | 99.5% mensal | dependência Inngest |

SLAs são objetivos internos; downtime programado com aviso de 7 dias não conta. Incidentes > 30min geram post-mortem público (interno).

---

## 2. RPO e RTO

| Métrica | Alvo | Como |
|---|---|---|
| RPO (Recovery Point Objective) | 5 minutos | Supabase PITR contínuo (WAL) |
| RTO (Recovery Time Objective) | 1 hora | Restore para novo projeto Supabase + swap DNS + Vercel redeploy |

Teste de disaster recovery: **trimestral**, executado por `admin`. Checklist:

1. Clonar projeto Supabase em `-dr`.
2. Restaurar PITR para timestamp -1h.
3. Apontar instância Vercel de staging para `-dr`.
4. Validar fluxos críticos (login, timeline, webhook idempotente).
5. Registrar tempo real de recuperação.

Backups complementares (ver [`03-data-layer.md §8`](./03-data-layer.md)):

- Dump lógico semanal (domingo 03:00 UTC) para bucket `backups-cold`, retenção 2 anos.
- Versionamento de schema em git cobre DDL.

---

## 3. Performance — alvos

### 3.1. Server Actions

| Percentil | Alvo |
|---|---|
| p50 | < 150 ms |
| p95 | < 500 ms |
| p99 | < 1500 ms |

Excedeu p95 por janela de 5min -> alerta ([`07-observability.md §5`](./07-observability.md)). Ações que inerentemente são longas (bulk edit, export) são isentas e rodam em Inngest.

### 3.2. Queries críticas

| Query | Alvo p95 |
|---|---|
| Timeline do contato (últimos 50 eventos) | < 300 ms |
| Lista inbox (50 conversas) | < 250 ms |
| Busca de contatos por e-mail/phone/CPF | < 150 ms |
| Dashboard de inadimplência (agregado diário) | < 800 ms |
| `selectCondition` (decisão de oferta) | < 100 ms |

Índices obrigatórios documentados em cada módulo (`docs/20-domain/*.md §3`).

### 3.3. Webhook handler

| Percentil | Alvo |
|---|---|
| p50 | < 80 ms |
| p95 | < 200 ms |

Handler **apenas valida assinatura + INSERT em `webhook_log` + `inngest.send`**. Processamento pesado vai para Inngest, nunca bloqueia resposta ao provedor.

### 3.4. Realtime

- Delay de propagação CDC -> cliente: < 500 ms p95 em condições normais.
- Reconnect automático quando websocket cai; retry exponencial no SDK.

### 3.5. Inngest

- Tempo até start do job após `inngest.send`: < 2 s p95.
- `webhook_process_ms` p95 < 1500 ms (inclui transação DB + timeline + audit + grant entitlement).

---

## 4. Storage — anexos de inbox

### 4.1. Limites

| Item | Limite |
|---|---|
| Tamanho máximo de arquivo | 25 MB |
| Tipos permitidos | PDF, imagem (png, jpg, webp, gif), áudio (mp3, ogg, m4a), vídeo curto (mp4, webm), documentos (docx, xlsx, pptx) |
| Tipos proibidos | Executáveis (exe, dmg, sh, bat, apk), arquivos sem extensão reconhecível |
| Quarentena | Arquivos com signature mismatch vão para bucket `quarantine-attachments`, revisão manual |

Upload via Supabase Storage com política: apenas autenticado, scope por `contact_id` ou `conversation_id`.

### 4.2. Retenção

- **Anexos de inbox:** 5 anos (retenção fiscal + operacional).
- **Exports gerados:** 30 dias no bucket `exports/`.
- **Backups PITR:** 14 dias (Supabase Team plan).
- **Dump semanal frio:** 2 anos.

### 4.3. CDN e entrega

- Supabase Storage entrega via CDN global.
- Imagens otimizadas via `next/image` quando uso estático; anexos de inbox entregues via signed URL com TTL 1h.

### 4.4. Bucket organization

| Bucket | Privacidade | Uso |
|---|---|---|
| `inbox-attachments` | privado | Mídias de conversas |
| `user-avatars` | público leitura | Avatares de usuário interno |
| `contact-documents` | privado | Documentos fiscais, comprovantes |
| `exports` | privado, TTL 30d | CSV/XLSX gerados por admin |
| `backups-cold` | privado, admin-only | Dumps semanais |
| `quarantine-attachments` | privado | Arquivos suspeitos |

---

## 5. Limites Fase 1

| Recurso | Limite Fase 1 | Ação quando excedido |
|---|---|---|
| Contatos por marca | 50.000 | Particionar por marca + escalar |
| Vendas por mês (pico) | 500 | Dimensionar Inngest concurrency |
| Conversas ativas | 2.000 concorrentes | Avaliar particionamento de canal |
| Webhooks/minuto (por provedor) | 200 (throttle) | Aumentar `throttle.limit` |
| Anexos/mês | 10 GB | Avaliar plano Supabase |
| Usuários internos | 100 | — |

Fase 2 (Sprints 10+) revisa limites com base em dados reais.

---

## 6. Segurança

### 6.1. Transporte

- **HTTPS obrigatório** em toda rota. HSTS com `max-age=63072000; includeSubDomains; preload`.
- TLS 1.2+ (ver config Vercel/Supabase).

### 6.2. Secrets

| Ambiente | Local | Gestão |
|---|---|---|
| Produção | Vercel + Supabase env vars | Rotação trimestral, audit via `audit_log.action_kind='update',resource_kind='integration'` |
| Preview | Vercel preview env (valores de stg) | — |
| Local | `.env.local` (gitignored) | Nunca commitar |

Rotação trimestral obrigatória de: `SUPABASE_SERVICE_ROLE_KEY`, webhook secrets de cada provedor, `IMPERSONATION_SIGNING_KEY`. Calendário formalizado em `docs/90-meta`.

### 6.3. CSP e headers

`next.config.js`:

```ts
headers: [
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' vercel.live; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://inngest.com" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=()' },
]
```

### 6.4. Autenticação e sessão

Detalhes em [`06-auth-rbac-audit.md`](./06-auth-rbac-audit.md). Resumo:

- 2FA TOTP obrigatório para `admin` e `financial`.
- Sessão 30 dias rotação; inatividade 7 dias.
- Impersonação HMAC-signed, TTL 30min.

### 6.5. Dependências

- Dependabot ativo para atualização de patches de segurança.
- Bloqueio de merge em PR com vulnerabilidade `high`/`critical` conhecida em dep.
- Auditoria `pnpm audit` em CI (warn, não fail — evita travar por falso positivo de transitiva).

---

## 7. LGPD — Fase 1

### 7.1. Postura

Fase 1 **adia** implementação completa de direitos LGPD (acesso, portabilidade, exclusão automática). Motivos e risco aceito formalmente em **ADR dedicado** (a criar) antes do go-live.

Base já existente:

- Trilha de auditoria (`audit_log`) suficiente para demonstrar acesso a dados.
- Consentimento registrado como `contact.consents` (jsonb) — spec a fechar.
- Tags de origem (opt-in, import, checkout) distinguem natureza do dado.

### 7.2. Pendências para Fase 2

| Direito | Implementação Fase 2 |
|---|---|
| Acesso (relatório do titular) | Função `exportContactData(contactId)` gera JSON + PDF |
| Retificação | Já atendida pela UI de edição de contato |
| Exclusão | `deleteContactWithLgpdPurge` — anonimiza campos PII e mantém rastreabilidade (snapshot preservado com referência anonimizada) |
| Portabilidade | Formato JSON padronizado |
| Oposição | Flag `contact.opted_out_at` + bloqueio de comunicação automática |

### 7.3. Tratamento atual

- Dados sensíveis (CPF, documentos) **nunca** em logs ou Sentry `message`.
- Retenção mínima de `audit_log` = 3 anos (base legal financeira/fiscal).
- Arquivos em Supabase Storage têm URLs assinadas com TTL curto.
- `impersonation` exige permissão + 2FA + auditoria visível.

### 7.4. Riscos aceitos (documentar em ADR)

- Purge automática de dados inativos ainda não implementada.
- Portal público de titular ainda não existe — pedidos LGPD tratados via suporte manual.

---

## 8. Compliance financeiro

- Retenção mínima de `transaction_snapshot` e `audit_log`: **5 anos** (prazo fiscal brasileiro).
- Exports de transações tem meta-audit (audit-of-audit) gravado.
- Emissão fiscal via Notazz: toda NFe/NFS-e fica rastreável por `transaction_id`.

---

## 9. Acessibilidade

- Conformidade alvo: **WCAG 2.1 AA**.
- Auditoria manual pré-Sprint-finalização via `axe-core`.
- Componentes Radix já entregam semântica correta por padrão.
- Teste E2E de teclado (navegação com `Tab`, `Shift+Tab`, `Enter`, `Esc`) em fluxos críticos.

Detalhe em `/70-ux/` (outro agente).

---

## 10. Monitoramento de NFR

| NFR | Medição | Alerta |
|---|---|---|
| SLA front | Uptime externo + Vercel Analytics | < 99.5% semanal |
| SLA inbox | Healthcheck específico | Endpoint devolve 5xx > 3min |
| Performance p95 Server Action | Axiom query | > 500ms por 15min |
| Webhook p95 handler | Axiom + Vercel Analytics | > 200ms por 15min |
| DLQ size | Axiom + cron | > 5 em 15min |
| Storage uso | Supabase dashboard | > 80% do plano |
| Query timeline p95 | Axiom + query `PG_STAT_STATEMENTS` | > 300ms |

---

## 11. Casos de teste / verificação

| ID | Cenário | Esperado |
|---|---|---|
| CT-NFR-01 | Upload de 26MB -> rejeitado pelo Storage | integration |
| CT-NFR-02 | Upload de executável (.exe) -> rejeitado por mime | integration |
| CT-NFR-03 | `POST /api/webhooks/*` devolve 200 em < 200ms p95 | benchmark |
| CT-NFR-04 | Load test de 100 Server Actions concorrentes mantém p95 < 500ms | benchmark manual |
| CT-NFR-05 | Restore PITR em ambiente DR completa em < 1h | trimestral manual |
| CT-NFR-06 | Header `Strict-Transport-Security` presente em toda resposta HTML | e2e |
| CT-NFR-07 | Bucket privado: acesso sem signed URL retorna 403 | integration |

---

## 12. Open Questions

- `OQ-NFR-01`: ampliar SLA para 99.9% na Fase 2 exige replica de leitura ou sobrou margem com Supabase?
- `OQ-NFR-02`: tolerância a anexos > 25MB (vídeo longo) — armazenar externamente (Loom/S3 link) ou aumentar limite?
- `OQ-NFR-03`: quando migrar para particionamento `pg_partman` — volume `audit_log` > 5M?
- `OQ-NFR-04`: ADR LGPD Fase 1 — formalizar em `docs/90-meta/04-decision-log.md` antes do go-live.
