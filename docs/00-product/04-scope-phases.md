# Escopo por fases

## 1. Fase 1 — Núcleo operacional (este documento)

Entra como prioridade de desenvolvimento:

- multi-marca + multi-CNPJ
- CRM global de contatos (identificação, conflitos, merge, tags, campos personalizados, notas)
- timeline unificada do contato
- inbox omnichannel (WhatsApp, Instagram, e-mail)
- tickets de atendimento
- campanhas, criativos, links rastreáveis, UTMs
- funis, estágios, histórico de estágio, score configurável, oportunidades, metas
- catálogo comercial (produtos + benefícios)
- motor de ofertas com condições, regras de elegibilidade, opções de pagamento
- snapshot imutável da venda e direitos adquiridos
- **assinaturas + parcelamento + inadimplência** (expansão vs PRD original — ver ADR-01)
- **reembolso formalizado** (ver ADR-02)
- integrações prioritárias: Digital Guru, Brevo, WhatsApp API Oficial, Notazz, Analytics
- dashboards gerenciais e analíticos básicos
- automações visuais

## 2. Fase 2 — Expansões previstas (arquitetura preparada, não implementado)

- área de membros / login do aluno
- cadastro acadêmico de cursos, módulos, aulas, trilhas (profundo)
- catálogo educacional
- eventos presenciais
- certificados
- gestão editorial avançada (aprovação, publicação, preview)
- comissão comercial
- B2B multiusuário
- LGPD avançada (portal do titular, exportação, pseudonimização)
- API pública

## 3. Fora de escopo (Fase 1 e Fase 2)

- LMS de terceiros embutido
- videoconferência nativa
- emissor fiscal próprio (usamos Notazz)
- gateway de pagamento próprio (usamos Digital Guru)
- marketplace

## 4. Escopo de ferramentas externas substituídas

| Ferramenta externa | Quando é substituída |
|---|---|
| CRM atual fragmentado | Sprints 1-2 |
| Inbox externo | Sprints 3-4 |
| Ferramenta de campanha/UTM | Sprint 5 |
| Planilhas de oferta | Sprints 6-7 |
| Conciliação manual de vendas | Sprint 8 |
| Planilha de inadimplência | Sprint 9 |

Migração por **dual-run** (ADR-03): sistema novo roda em paralelo até estabilizar.
