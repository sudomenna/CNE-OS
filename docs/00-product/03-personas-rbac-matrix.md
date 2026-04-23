# Personas e matriz RBAC

## 1. Perfis (Fase 1)

| Papel | Descrição | Exemplo de tarefas |
|---|---|---|
| `admin` | Administração geral, todos os poderes | configurar marcas, criar papéis, reembolsar, impersonar |
| `financeiro` | Conciliação, cobrança, reembolso | abrir reembolso, ver faturamento, tratar inadimplência |
| `marketing` | Campanhas, criativos, conteúdo, funis de topo | criar campanha, cadastrar criativo, gerar link rastreável, rodar condições |
| `suporte` | Atendimento omnichannel, tickets | responder inbox, abrir ticket, encaminhar |
| `comercial` | Vendas, funil, ofertas, negociação | mover oportunidade, criar oferta, cadastrar condição, fechar venda |

**Diretriz Fase 1:** todos os usuários internos enxergam todas as marcas. Escopo de marca por papel fica para Fase 2.

## 2. Ações críticas (sujeitas a RBAC rígido + auditoria)

| Ação | admin | financeiro | marketing | suporte | comercial |
|---|:-:|:-:|:-:|:-:|:-:|
| Ver faturamento / visão financeira | ✅ | ✅ | ❌ | ❌ | ✅ |
| Abrir reembolso | ✅ | ✅ | ❌ | ❌ | ❌ |
| Aprovar reembolso | ✅ | ✅ | ❌ | ❌ | ❌ |
| Criar / editar oferta | ✅ | ❌ | ❌ | ❌ | ✅ |
| Criar / editar condição comercial | ✅ | ❌ | ✅ | ❌ | ✅ |
| Criar / editar cupom | ✅ | ❌ | ❌ | ❌ | ✅ |
| Criar / editar campanha | ✅ | ❌ | ✅ | ❌ | ✅ |
| Criar / editar criativo | ✅ | ❌ | ✅ | ❌ | ❌ |
| Criar / editar funil e estágios | ✅ | ❌ | ✅ | ❌ | ✅ |
| Merge de contato | ✅ | ✅ | ✅ | ✅ | ✅ |
| Desfazer merge | ✅ | ✅ | ❌ | ❌ | ❌ |
| Impersonar cliente/aluno | ✅ | ✅ | ❌ | ✅ | ✅ |
| Configurar integração externa | ✅ | ❌ | ❌ | ❌ | ❌ |
| Criar / editar usuário interno | ✅ | ❌ | ❌ | ❌ | ❌ |
| Editar dados de contato (bulk) | ✅ | ✅ | ❌ | ✅ | ✅ |
| Responder no inbox | ✅ | ✅ | ✅ | ✅ | ✅ |
| Abrir ticket | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cancelar ticket | ✅ | ✅ | ❌ | ✅ | ✅ |

Referência canônica na implementação: [`../50-business-rules/BR-RBAC.md`](../50-business-rules/BR-RBAC.md).

## 3. Regras de segurança adicionais

- **2FA (TOTP) obrigatório** para `admin` e `financeiro` desde o dia 1 (ver `10-architecture/06-auth-rbac-audit.md`).
- Todas as ações marcadas acima emitem trilha de auditoria imutável (ver `30-contracts/06-audit-trail-spec.md`).
- Escopo por marca dentro de cada papel é **Fase 2**. Na Fase 1, papel = permissão global.

## 4. Open Questions

- `OQ-RBAC-01`: Impersonação de aluno/cliente precisa de "modo de acesso limitado" na Fase 1 ou pode ser total?
- `OQ-RBAC-02`: Suporte pode ver histórico financeiro do contato (valores) ou só status de cobrança?
