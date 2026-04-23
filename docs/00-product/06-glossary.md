# Glossário canônico

Termos deste sistema. Quando um termo aparecer ambíguo em código ou doc, esta é a definição autoritativa.

## Produto / comercial

**Marca (brand)** — unidade de negócio da CNE (ex.: CNE Carreiras, CNE Educação). Pode compartilhar CNPJ com outras marcas ou ter múltiplos. Toda oferta, funil, campanha, criativo pertence a uma marca.

**Entidade fiscal (legal_entity)** — CNPJ emissor de nota. Uma marca pode ter N; um CNPJ pode servir N marcas.

**Contato (contact)** — pessoa física. Entidade global no sistema, identificada prioritariamente por CPF; subsidiariamente por telefone (> e-mail). Ver [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md).

**Lead** — contato sem compra aprovada.
**Cliente** — contato com ao menos 1 compra aprovada.
**Aluno** — contato com compra de produto classificado como `curso` ou `treinamento`. Ver `product_kind`.
**Lead pago / inscrito pago** — contato com compra de produto-isca (ebook etc.) que **não** vira aluno.

**Produto (product)** — item do catálogo da marca. Nunca vendido diretamente; sempre dentro de uma oferta. Tem `product_kind` (curso, ebook, treinamento, mentoria, bônus, outro).

**Benefício comercial (commercial_benefit)** — item que pode ser entregue sem ser produto formal (ex.: "acesso a grupo VIP", "certificado especial"). Reutilizável em várias ofertas.

**Oferta (offer)** — pacote comercial principal pertencente a uma marca. O que o mercado vê. Tem 1 ou mais **condições**.

**Condição comercial da oferta (offer_condition)** — conjunto nomeado de itens, regras de elegibilidade e opções de pagamento dentro da oferta. Uma oferta sempre tem uma **condição padrão** (fallback).

**Opção de pagamento (offer_payment_option)** — forma de cobrança dentro da condição (PIX, cartão, parcelamento, etc.). Pode alterar preço e forma, **nunca altera benefícios**.

**Regra de elegibilidade** — condição que determina se uma `offer_condition` pode ser aplicada a uma venda: data, quantidade de vendas aprovadas, campanha, canal, criativo, uso interno, ou combinação E/OU.

**Oportunidade (funnel_entry)** — entrada de um contato em um funil. Cada oportunidade tem estágio, score, responsável, origem de entrada, criativo de entrada.

**Transação (transaction)** — registro de venda aprovada ou tentativa. Gera snapshot.

**Snapshot da transação (transaction_snapshot)** — cópia `jsonb` congelada de tudo que foi aplicado na venda (oferta, condição, itens, opção de pagamento, CNPJ emissor). **Imutável**.

**Direito adquirido (customer_entitlement)** — o que o cliente ganhou o direito de consumir em função de uma compra (acesso a curso, bônus, benefício). Consolidável: nova compra pode estender/substituir (ver `BR-ENTITLEMENT-CONSOLIDATION`).

**Assinatura (subscription)** — ciclo de cobrança recorrente ligado a uma oferta/condição. Possui status, próximo débito, trial.

**Parcela (installment)** — uma ocorrência de cobrança em plano parcelado ou assinatura.

## Atendimento

**Conversa (conversation)** — fluxo de mensagens entre contato e CNE em um canal específico. Pode estar sem responsável; um contato tem N conversas simultâneas. **Diferente de ticket.**

**Ticket** — registro formal de demanda/solicitação. Nasce opcionalmente de uma conversa. Tem responsável próprio, categoria, prioridade, status, prazo.

**Canal (channel)** — WhatsApp, Instagram, e-mail.
**Conta de canal (channel_account)** — instância configurada de um canal (ex.: número WhatsApp específico).

## Marketing

**Campanha (campaign)** — peça de marketing pertencente a uma marca, apontando para **um único funil**.

**Criativo (creative)** — ativo de comunicação (anúncio, copy, landing). Pertence a uma campanha. É a **menor unidade de análise**.

**Link rastreável (trackable_link)** — URL com UTMs geradas automaticamente pelo sistema a partir de marca/campanha/criativo/funil.

## Dados e eventos

**Timeline do contato** — stream de eventos unificado por contato, emitido por todos os módulos. Filtrável por marca, canal, tipo, período. Ver [`TE-*`](../30-contracts/03-timeline-event-catalog.md).

**Pendência de contato (contact_issue)** — registro aberto quando o sistema detecta ambiguidade (e-mail duplicado, telefone conflitante, dados divergentes entre fontes) e **não** pode resolver automaticamente.

**Merge** — unificação de 2 contatos em 1 principal, **não-destrutivo**: registros apontam para o principal, antigo permanece como histórico, pode ser desfeito.

**Blacklist** — lista de contatos bloqueados para comunicação / compra.

## Integrações

**Webhook log** — registro append-only de cada evento recebido de provedor externo, com `external_event_id` único. Base para idempotência.

**DLQ (dead-letter queue)** — fila para eventos externos não mapeáveis ou com falha de processamento após N retries. Reprocessamento manual.

## Automação

**Fluxo de automação (automation_flow)** — grafo configurável com gatilhos, condições e ações.

**Gatilho (trigger)** — evento que inicia um fluxo (nova mensagem, compra aprovada, mudança de estágio etc.).

**Ação (action)** — efeito executado pelo fluxo (aplicar tag, mover estágio, disparar envio, abrir ticket etc.).
