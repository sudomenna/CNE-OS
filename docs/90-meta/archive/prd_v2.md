# PRD V2 — Sistema Operacional de Gestão Comercial, Marketing e CRM da CNE Educação

## 1. Informações do documento

**Produto:** Sistema Operacional da CNE Educação  
**Versão:** V2  
**Data:** 21 de abril de 2026  
**Status:** Documento de produto consolidado para planejamento de arquitetura e roadmap  
**Empresa:** CNE Educação  
**Mercado:** Ensino Jurídico

---

## 2. Visão do produto

A CNE Educação opera hoje com dados distribuídos em diversas ferramentas externas, gerando divergência de informação, retrabalho operacional, dificuldade de conciliação entre áreas, baixa visibilidade gerencial e alto custo com assinaturas de software.

Este produto será o sistema central da operação comercial, de marketing, CRM e atendimento da empresa. O objetivo é transformar o sistema na fonte principal da verdade para contatos, jornada comercial, comunicação com leads e clientes, rastreamento de campanhas, estruturação de ofertas, registro de vendas e consolidação operacional.

O sistema deverá nascer de forma modular e evolutiva, permitindo que a CNE substitua gradualmente ferramentas externas sem depender de uma reescrita completa futura.

### 2.1. Declaração de produto

Construir um sistema operacional multi-marca, com CRM global, inbox omnichannel, gestão de marketing e funis, motor comercial de ofertas dinâmicas e integração com ferramentas externas, centralizando os dados da CNE Educação para análise, tomada de decisão e execução operacional.

### 2.2. Norte estratégico

O sistema deve:

- centralizar a operação hoje fragmentada
- reduzir dependência de ferramentas externas
- eliminar divergência de informações entre sistemas
- melhorar o fluxo entre marketing, comercial, suporte, financeiro e administração
- permitir crescimento modular
- preservar histórico e direitos adquiridos de clientes
- consolidar relatórios gerenciais com base em dados internos e integrações externas

---

## 3. Objetivos do produto

### 3.1. Objetivos de negócio

- Consolidar em um único ambiente os dados de leads, contatos, clientes e alunos.
- Melhorar a operação comercial e de marketing com visão centralizada da jornada.
- Reduzir custos com ferramentas externas substituídas ao longo do tempo.
- Aumentar a confiabilidade dos dados para tomada de decisão.
- Permitir conciliação operacional e financeira com dados persistidos de integrações externas.
- Estruturar um núcleo tecnológico próprio da empresa.

### 3.2. Objetivos operacionais

- Manter identidade única de contato no sistema.
- Unificar histórico de mensagens, tickets, notas, funis e compras em uma timeline central por contato.
- Permitir trabalho integrado entre comercial, suporte, marketing, financeiro e admin.
- Operar campanhas e funis por marca.
- Modelar ofertas com condições comerciais variáveis ao longo do tempo.
- Registrar exatamente o que foi contratado em cada compra.

### 3.3. Objetivos de produto

- Lançar uma primeira fase forte em CRM, atendimento, marketing, funis, comercial e consolidação de vendas.
- Preparar arquitetura para futuras camadas como LMS, área de membros, eventos, fluxos acadêmicos e automações mais sofisticadas.

---

## 4. Escopo por fases

## 4.1. Fase 1 — Núcleo operacional

Entram como prioridade de desenvolvimento:

- multi-marca
- multi-CNPJ
- CRM global de contatos
- identificação, conflitos e merge de contatos
- tags, campos personalizados e notas
- timeline unificada do contato
- inbox omnichannel
- tickets de atendimento
- campanhas
- criativos
- links rastreáveis
- funis
- estágios e histórico de estágio
- score configurável
- oportunidades por funil
- metas por vendedor
- catálogo comercial
- benefícios comerciais
- ofertas
- condições comerciais de oferta
- opções de pagamento
- snapshot da venda
- integrações prioritárias
- dashboards gerenciais e analíticos

## 4.2. Fase 2 — Expansões previstas

Preparado na arquitetura, mas não obrigatório no MVP:

- área de membros
- login do aluno
- cadastro acadêmico de cursos, módulos, aulas e trilhas
- catálogo educacional profundo
- eventos presenciais
- certificados
- gestão editorial avançada
- comissões
- B2B multiusuário
- LGPD avançada
- API pública

---

## 5. Usuários do sistema

Perfis previstos para a primeira fase:

- admin
- financeiro
- marketing
- suporte
- comercial

### 5.1. Diretriz de acesso inicial

Na primeira fase, todos os usuários internos enxergam todas as marcas.

### 5.2. Permissões principais já definidas

- **Faturamento e visão financeira:** admin, financeiro e comercial
- **Reembolso:** admin e financeiro
- **Oferta, cupom e campanha:** admin e comercial
- **Campanha também por marketing:** marketing pode operar campanhas
- **Impersonação futura de aluno/cliente:** permitida quando aplicável

---

## 6. Estrutura organizacional

O sistema deve ser multi-marca desde o início.

### 6.1. Regras organizacionais

- Uma marca pode operar com mais de um CNPJ.
- Um CNPJ pode ser compartilhado por mais de uma marca.
- Produtos pertencem a uma marca.
- Ofertas pertencem a uma marca.
- Funis pertencem a uma marca.
- Campanhas pertencem a uma marca.
- Criativos pertencem a campanhas de uma marca.
- O contato é global no sistema e pode interagir com várias marcas.
- A timeline do contato é única, com possibilidade de filtro por marca.

---

## 7. Problemas que o sistema resolve

### 7.1. Problemas atuais

- Dados duplicados e divergentes em várias ferramentas.
- Falta de sincronização entre sistemas.
- Dificuldade de entender a jornada do contato ponta a ponta.
- Ausência de visão consolidada entre marketing, comercial, suporte e financeiro.
- Dependência excessiva de plataformas externas.
- Baixa governança sobre condições comerciais e histórico das vendas.

### 7.2. Resultado esperado

Com o sistema em produção, a CNE deverá ser capaz de:

- localizar um contato e entender toda sua jornada em um só lugar
- saber por qual marca, funil, campanha e criativo ele entrou
- ver quais conversas aconteceram e quem é o responsável atual
- entender o estágio comercial atual de cada oportunidade
- saber exatamente o que foi vendido e em quais condições
- conciliar melhor vendas e recebimentos externos

---

## 8. Princípios de design do produto

### 8.1. Fonte única da verdade

O sistema é o núcleo central da operação, e integrações externas devem ser adaptadas ao modelo interno, nunca o contrário.

### 8.2. Histórico imutável de venda

Compras passadas não podem ser alteradas por mudanças futuras em oferta, produto ou benefício.

### 8.3. Centralidade do contato

O contato é a entidade principal de leitura operacional. Toda a história relevante deve ser acessível a partir dele.

### 8.4. Modularidade

Os módulos devem ter baixo acoplamento, permitindo implementação por camadas.

### 8.5. Resolução humana em conflito crítico

Conflitos de identidade e inconsistências relevantes devem permitir decisão manual assistida, em vez de automação destrutiva.

---

## 9. Módulos do produto

## 9.1. Módulo 1 — Núcleo organizacional

### Finalidade
Representar marcas, entidades fiscais e usuários internos.

### Entidades conceituais
- Marca
- Entidade fiscal / CNPJ
- Relação marca x CNPJ
- Usuário interno
- Papel/perfil

### Requisitos
- cadastrar marcas
- cadastrar múltiplos CNPJs
- associar um ou mais CNPJs a marcas
- permitir que um CNPJ sirva mais de uma marca
- manter base para propriedade de produtos, ofertas, funis e campanhas

---

## 9.2. Módulo 2 — CRM global e identidade de contatos

### Finalidade
Centralizar o cadastro único de pessoas e resolver conflitos de identidade.

### Entidades conceituais
- Contato
- Documento do contato
- Telefone do contato
- E-mail do contato
- Tag de contato
- Campo personalizado do contato
- Nota de contato
- Histórico de alteração de campo
- Pendência/problema de contato
- Sugestão de merge
- Merge realizado
- Blacklist

### 9.2.1. Regras de identidade

- CPF, quando existir, é obrigatório, único e prevalece sobre telefone e e-mail.
- Telefone é único por contato.
- O contato pode ter múltiplos e-mails.
- O contato pode ter múltiplos telefones registrados, mas apenas um telefone ativo.
- Em conflitos de telefone e e-mail, o sistema pode registrar dados alternativos, mas deve abrir pendência quando necessário.

### 9.2.2. Regras operacionais de cadastro e conflito

- Se entrar um novo cadastro com o mesmo telefone e e-mail diferente, o sistema considera o mesmo contato e adiciona o novo e-mail como alternativo.
- Se entrar um novo cadastro com o mesmo e-mail e telefone diferente, o sistema cria um novo contato e marca pendência de e-mail duplicado para solução manual.
- Se esse novo telefone receber depois outro e-mail diferente, o sistema mantém o mesmo ID do contato associado ao telefone, adiciona o novo e-mail como alternativo e marca pendência para revisão manual.
- Se entrar um cadastro com mesmo CPF, o sistema unifica no mesmo contato e marca conflito para revisão se outros dados divergirem.

### 9.2.3. Regras de merge

- Merge não deve ser destrutivo.
- Deve existir contato principal.
- Deve existir histórico de merge com autor, data e motivo.
- Deve ser possível desfazer merge.
- Registros relacionados devem passar a apontar para o contato principal.
- O contato antigo permanece registrado como histórico de referência.
- Todos os usuários internos podem realizar merge na fase inicial.

### 9.2.4. Prioridade de confiança dos dados

Quando houver divergência entre fontes, o sistema deve considerar a seguinte prioridade:

1. dados vindos de checkout ou integração de meio de pagamento
2. dados alterados manualmente por atendente
3. dado mais recente

### 9.2.5. Status do contato

Status iniciais previstos:
- ativo
- inativo
- inválido
- bloqueado

### 9.2.6. Status de telefone

- principal
- secundário
- WhatsApp válido
- sem WhatsApp
- inválido

### 9.2.7. Status de e-mail

- principal
- alternativo
- inválido
- descadastrado

### 9.2.8. Classificação comercial do contato

O sistema deve permitir classificação por tipo operacional, sem depender apenas do status bruto do cadastro:

- lead
- cliente
- aluno
- lead pago / inscrito pago

#### Regras já definidas
- primeira compra aprovada transforma lead em cliente
- compra de curso ou treinamento online/presencial caracteriza aluno
- compra de ebook ou produto-isca pode caracterizar lead pago/inscrito pago, sem virar aluno

---

## 9.3. Módulo 3 — Timeline unificada do contato

### Finalidade
Oferecer leitura completa da jornada do contato em um único lugar.

### Eventos que devem aparecer na timeline
- mensagens
- tickets
- notas
- compras
- entradas em funil
- mudanças de estágio
- envios de campanha
- eventos de campanha
- eventos de integração
- mudanças críticas de dados
- tags relevantes

### Requisitos
- timeline única por contato
- filtros por marca, tipo de evento, canal e período
- navegação rápida entre contexto comercial, suporte, marketing e venda

---

## 9.4. Módulo 4 — Inbox omnichannel e atendimento

### Finalidade
Centralizar conversas de WhatsApp, Instagram e e-mail.

### Entidades conceituais
- Conversa
- Canal
- Conta de canal
- Mensagem
- Anexo de mensagem
- Histórico de responsável da conversa
- Nota interna da conversa
- Histórico de status da conversa

### 9.4.1. Regras principais

- Conversa e ticket são entidades separadas.
- Nem toda conversa gera ticket.
- Um contato pode ter várias conversas simultâneas.
- Para o usuário interno, a visualização deve ser uma caixa única agregada por contato.
- O responsável é da conversa, não do contato inteiro.
- A conversa pode estar sem responsável até alguém assumir.
- Atribuição manual deve ser permitida.
- Mensagens novas podem reabrir a conversa.
- Mensagens externas também precisam compor o histórico.
- Instagram, WhatsApp e e-mail devem permitir resposta de dentro do sistema.

### 9.4.2. Status da conversa

Status mínimos:
- aberta
- aguardando cliente
- aguardando equipe
- encerrada

### 9.4.3. Requisitos adicionais

- comentários internos entre atendentes
- notas privadas por conversa
- vínculo opcional com marca, funil, campanha, oferta ou transação
- se a marca não puder ser identificada automaticamente, a conversa pode permanecer sem marca até classificação manual

---

## 9.5. Módulo 5 — Tickets e suporte formal

### Finalidade
Formalizar problemas, demandas e solicitações específicas.

### Entidades conceituais
- Ticket
- Categoria de ticket
- Prioridade de ticket
- Histórico de status do ticket
- Histórico de atribuição do ticket
- Nota do ticket

### 9.5.1. Regras principais

- Ticket pode nascer de uma conversa, mas não é obrigatório.
- Um ticket pode ter responsável diferente do responsável da conversa.
- Um contato pode ter vários tickets abertos ao mesmo tempo.
- Ticket pode ser reaberto.

### 9.5.2. Campos essenciais

- número
- categoria
- prioridade
- status
- responsável
- prazo
- origem
- marca
- contato
- conversa de origem

### 9.5.3. Status sugeridos

- aberto
- em andamento
- aguardando retorno
- resolvido
- cancelado

### 9.5.4. Prioridades

- baixa
- média
- alta
- urgente

### 9.5.5. Categorias iniciais sugeridas

- comercial
- suporte
- financeiro
- cancelamento
- reembolso
- acesso
- cadastro
- outro

---

## 9.6. Módulo 6 — Marketing, campanhas e conteúdo

### Finalidade
Organizar campanhas, criativos, links, peças e ativos de conteúdo.

### Entidades conceituais
- Campanha
- Criativo
- Ativo de criativo
- Link rastreável
- Biblioteca de conteúdo
- Pasta de conteúdo
- Briefing de conteúdo
- Planejamento de conteúdo

### 9.6.1. Regras principais

- Campanha é separada de funil.
- Campanha pertence a uma marca e aponta para um único funil.
- Criativo pertence a uma campanha.
- Uma campanha pode ter vários criativos.
- Um criativo novo é um novo registro, sem versionamento interno do mesmo criativo.
- Um link rastreável pode ser compartilhado entre campanha, criativo e funil.
- O sistema deve gerar UTMs automaticamente com base em marca, campanha, criativo e funil.
- A menor unidade de análise é o criativo.

### 9.6.2. Escopo funcional atual e futuro

Primeira fase:
- cadastro de campanhas
- cadastro de criativos
- cadastro de links rastreáveis
- biblioteca de ativos e metadados
- histórico de origem de entrada e origem de conversão

Preparado para futura expansão:
- calendário editorial
- copies
- roteiros
- aprovações
- publicação
- preview dos ativos

---

## 9.7. Módulo 7 — Funis, pipeline e oportunidades

### Finalidade
Modelar a jornada comercial de cada contato dentro de cada funil.

### Entidades conceituais
- Funil
- Etapa do funil
- Entrada do contato no funil
- Histórico de estágio
- Score
- Etiquetas da oportunidade
- Meta comercial

### 9.7.1. Regras principais

- Cada funil possui seu próprio pipeline.
- Todo contato que entra em um funil se torna uma oportunidade comercial.
- Um contato pode estar em mais de um funil.
- Uma campanha aponta para um único funil.
- O funil vende uma oferta principal com variações.
- No mesmo funil, o contato não deve ter múltiplas oportunidades ativas equivalentes.
- Compra aprovada conclui a oportunidade.
- Se o contato comprar por outro caminho, a oportunidade pode ser marcada como ganha.

### 9.7.2. Estrutura mínima da oportunidade no funil

Cada entrada do contato no funil deve registrar:
- estágio atual
- data de entrada
- datas de transição
- score
- responsável comercial
- tags da oportunidade
- criativo de entrada
- criativo de conversão
- origem de entrada
- origem de conversão
- histórico de cliques principais

### 9.7.3. Regras de estágio e automação

- estágio do funil é separado de etiquetas macro da oportunidade
- deve existir histórico completo de mudança de estágio
- mudança de estágio pode disparar automações
- score é configurável por funil

### 9.7.4. Etiquetas macro da oportunidade

Em vez de modelagem complexa de status macro nesta fase, o sistema pode iniciar com etiquetas como:
- aberta
- em negociação
- concluída
- ganha
- perdida

---

## 9.8. Módulo 8 — Catálogo comercial

### Finalidade
Representar o que pode ser ofertado ao mercado.

### Entidades conceituais
- Produto
- Categoria de produto
- Benefício comercial

### 9.8.1. Regras principais

- Produto pertence a uma marca.
- Produto não é vendido diretamente; ele precisa estar dentro de uma oferta.
- O mesmo produto pode aparecer em várias ofertas.
- O mesmo produto pode ser principal em uma oferta e bônus em outra.
- Benefício comercial pode existir sem produto formal.
- Benefício comercial deve poder ser reutilizado em várias ofertas/condições.

### 9.8.2. Tipos de item comercial

Itens de uma condição de oferta podem ser classificados como:
- principal
- bônus
- upsell
- order bump
- complemento
- benefício comercial

### 9.8.3. Benefícios comerciais sem produto formal

Devem permitir, ao menos:
- informação contratada registrada no histórico
- aplicação de tag automática no contato
- vigência própria
- quantidade
- responsável
- status de entrega, quando aplicável

---

## 9.9. Módulo 9 — Motor comercial de ofertas

### Finalidade
Representar a lógica real da venda e das variações comerciais.

### Entidades conceituais
- Oferta
- Condição comercial da oferta
- Grupo lógico de regras
- Regra da condição
- Item da condição
- Opção de pagamento
- Histórico de status da oferta
- Histórico de prioridade da condição

### 9.9.1. Conceitos principais

#### Oferta
Pacote comercial principal, pertencente a uma marca.

#### Condição comercial da oferta
Conjunto nomeado que define:
- benefícios
- itens incluídos
- regras de elegibilidade
- regras de acesso de cada item
- prioridade
- score de vantagem comercial

#### Opção de pagamento
Forma de cobrança disponível dentro da condição:
- PIX
- cartão
- parcelamento
- condição especial criada pelo comercial
- futuras integrações externas de cobrança

### 9.9.2. Regras fundamentais

- A oferta deve ter nome e pode ter várias condições comerciais.
- A condição comercial deve ter nome próprio.
- A condição comercial pode ser criada pelo marketing ou comercial.
- A condição comercial pode ser interna, sem aparecer publicamente.
- A condição comercial pode ter várias opções de pagamento ativas ao mesmo tempo.
- A opção de pagamento pode alterar preço e forma de cobrança.
- A opção de pagamento não altera os benefícios da condição.
- Deve existir condição padrão da oferta para servir de fallback.
- Uma oferta já vendida pode ficar inativa, mas permanece visível no histórico.
- O contato não pode comprar a mesma oferta novamente.

### 9.9.3. Itens da condição

Cada item da condição deve suportar regras próprias como:
- tipo do item
- produto ou benefício comercial vinculado
- quantidade
- regra de acesso
- vigência
- desconto, quando aplicável
- responsável de entrega
- status de entrega

### 9.9.4. Regras de elegibilidade suportadas

A condição pode depender de regras por:
- data
- quantidade de vendas aprovadas
- campanha
- canal
- criativo
- uso interno do comercial
- combinação lógica de regras

### 9.9.5. Combinação lógica

O sistema deve suportar grupos lógicos com operadores:
- E
- OU

Exemplos válidos:
- campanha VIP e até dia X
- até dia X ou até 30 vendas aprovadas

### 9.9.6. Prioridade e decisão de condição

A condição aplicada numa venda deve obedecer esta hierarquia objetiva:

1. maior prioridade numérica
2. maior score de vantagem comercial
3. condição criada mais recentemente
4. se ainda houver empate, o sistema deve marcar conflito de regra para revisão

### 9.9.7. Definição objetiva de "mais vantajosa"

Como “mais vantajosa” não pode ser subjetivo, o sistema deve utilizar um campo numérico de **vantagem comercial** configurável manualmente na condição.

Esse score será definido pelo time de operação/comercial e servirá como desempate entre condições de mesma prioridade.

### 9.9.8. Contador de vendas

Quando houver regra do tipo “os 30 primeiros” ou equivalente, o contador deve considerar:
- vendas aprovadas
- no nível da oferta inteira

---

## 9.10. Módulo 10 — Snapshot da venda e direitos adquiridos

### Finalidade
Congelar o que foi comprado e preservar direitos futuros.

### Entidades conceituais
- Transação
- Snapshot da transação
- Condição aplicada na transação
- Itens gerados na transação
- Benefícios contratados na transação
- Direito adquirido do cliente
- Histórico do direito adquirido

### 9.10.1. Regras principais

- Cada venda deve registrar exatamente qual oferta, condição e opção de pagamento foram aplicadas.
- Mudanças futuras na oferta não alteram compras passadas.
- O histórico da compra deve mostrar cada item gerado individualmente com suas regras.
- Benefícios comerciais sem produto também devem aparecer como itens contratados.
- Tags oriundas de benefício comercial devem ser aplicadas automaticamente no contato.

### 9.10.2. Direitos adquiridos

Mesmo antes do LMS, o sistema deve registrar os direitos adquiridos resultantes da compra.

Cada direito deve suportar:
- data de início
- data de expiração
- origem do direito
- compra que gerou o direito
- compra que alterou o direito
- status do direito

### 9.10.3. Regras para atualização de direito adquirido

Quando uma nova compra envolver item já existente para o contato, o sistema deverá recalcular o direito de forma consolidada.

Exemplos:
- se antes era 12 meses e a nova compra garante vitalício, o direito passa a ser vitalício
- se antes era 12 meses e a nova compra adiciona mais 12 meses, o sistema deve estender a expiração

---

## 9.11. Módulo 11 — Integrações externas

### Finalidade
Receber, mapear e normalizar dados de ferramentas externas.

### Integrações prioritárias
- Digital Guru
- Brevo
- WhatsApp API Oficial
- Notazz
- Analytics

### Entidades conceituais
- Provedor de integração
- Conta de integração
- Mapeamento interno
- Evento de integração
- Log de integração
- Webhook log

### 9.11.1. Diretrizes de integração

- O sistema interno define o modelo canônico.
- Ferramentas externas devem ser adaptadas para esse modelo.
- Eventos externos relevantes devem ser armazenados para auditoria.
- Criação de condições especiais em ferramentas externas pode permanecer manual na primeira fase.

### 9.11.2. Regras por integração

#### Digital Guru
- principal meio de pagamento inicial
- meio externo de cobrança
- sistema deve mapear seus eventos para transação, condição aplicada e histórico de venda

#### Brevo
- usada para envio e também como fonte de eventos de engajamento

#### WhatsApp API Oficial
- múltiplos números/canais
- operação centralizada no inbox

#### Notazz
- emissão fiscal externa
- integração prevista para consolidação operacional e futura automação

#### Analytics
- uso extensivo para rastreamento e leitura gerencial

---

## 9.12. Módulo 12 — Automações visuais

### Finalidade
Executar regras de marketing, operação e atendimento por meio de fluxos configuráveis.

### Entidades conceituais
- Fluxo de automação
- Nó de automação
- Gatilho
- Condição
- Ação
- Execução do fluxo
- Log da execução

### Gatilhos mínimos previstos
- entrada no funil
- mudança de estágio
- nova mensagem
- abandono de checkout
- compra aprovada
- ticket aberto
- evento da Brevo
- evento de integração

### Ações mínimas previstas
- aplicar tag
- mover estágio
- abrir ticket
- notificar responsável
- registrar evento na timeline
- disparar envio por canal externo

---

## 9.13. Módulo 13 — Analytics e visão gerencial

### Finalidade
Disponibilizar dashboards e análises da operação.

### Leituras prioritárias
- contatos
- leads
- clientes
- alunos
- vendas
- funil por campanha
- funil por criativo
- origem de entrada
- origem de conversão
- coortes
- inadimplência consolidada
- conciliação gerencial

### Métricas futuras preparadas
- CAC
- LTV
- ROAS
- payback
- retenção avançada

---

## 10. Regras de negócio transversais

## 10.1. Propriedade por marca

- produto pertence a uma marca
- oferta pertence a uma marca
- funil pertence a uma marca
- campanha pertence a uma marca
- criativo pertence a uma campanha de uma marca

## 10.2. Venda sempre mediada por oferta

- produto só pode ser vendido dentro de oferta
- oferta pode conter um ou vários produtos
- oferta pode conter benefícios comerciais além de produtos

## 10.3. Compra única por oferta

- o contato não pode comprar a mesma oferta novamente

## 10.4. Histórico imutável

- oferta vendida não deve ser modificada para afetar o passado
- mudanças futuras devem ser representadas por nova condição comercial ou nova oferta, conforme o caso

## 10.5. Centralização da jornada

Tudo que for relevante para operação deve ser visualizado a partir do contato.

## 10.6. Resolução manual assistida

Conflitos de identidade, marcação de problemas e ambiguidades comerciais devem gerar pendências tratáveis pela equipe.

---

## 11. Fluxos principais

## 11.1. Fluxo de cadastro/entrada de contato

1. contato entra por landing page, mensagem, funil, integração ou compra
2. sistema avalia CPF, telefone e e-mail
3. sistema cria, atualiza ou marca pendência conforme regras de identidade
4. timeline recebe evento de entrada
5. contato pode ser associado a funil, campanha, criativo e marca

## 11.2. Fluxo de atendimento omnichannel

1. nova mensagem chega por WhatsApp, Instagram ou e-mail
2. sistema identifica ou cria contato
3. sistema abre ou reabre conversa
4. conversa pode ficar sem responsável ou ser atribuída manualmente
5. equipe acompanha caixa agregada do contato
6. se necessário, ticket é aberto a partir da conversa

## 11.3. Fluxo de funil e oportunidade

1. contato entra em funil por campanha/criativo
2. sistema registra origem de entrada
3. oportunidade é criada no funil
4. score e estágio são atualizados por automação ou ação manual
5. conversas e tickets podem ser vinculados à oportunidade
6. compra aprovada conclui a oportunidade

## 11.4. Fluxo de decisão comercial da oferta

1. sistema identifica oferta alvo
2. sistema avalia condições ativas da oferta
3. sistema filtra condições elegíveis pelas regras
4. sistema escolhe a condição conforme prioridade e score de vantagem
5. sistema seleciona a opção de pagamento utilizada
6. venda é registrada com snapshot completo da condição aplicada

## 11.5. Fluxo de integração de venda externa

1. Digital Guru envia evento de compra
2. sistema identifica contato, oferta e contexto comercial
3. sistema registra transação
4. sistema gera snapshot da venda
5. sistema gera itens contratados e benefícios
6. sistema cria ou atualiza direitos adquiridos
7. timeline recebe evento de venda

## 11.6. Fluxo de direito adquirido

1. venda aprovada gera direitos por item
2. se o cliente já possui o item, o sistema compara a nova condição com a anterior
3. se a nova condição for melhor, atualiza o direito consolidado
4. histórico do direito deve registrar origem da alteração

---

## 12. Entidades conceituais principais por prioridade

### Prioridade alta para modelagem da fase 1
- brand
- legal_entity
- contact
- contact_phone
- contact_email
- contact_document
- contact_issue
- contact_merge
- timeline_event
- conversation
- message
- ticket
- campaign
- creative
- trackable_link
- funnel
- funnel_stage
- funnel_entry
- product
- commercial_benefit
- offer
- offer_condition
- offer_condition_rule
- offer_condition_item
- offer_payment_option
- transaction
- transaction_snapshot
- transaction_item
- customer_entitlement
- integration_event

### Prioridade média
- contact_custom_field
- contact_note
- conversation_internal_note
- ticket_note
- sales_target
- automation_flow
- automation_trigger
- automation_action

### Prioridade futura
- content_brief
- content_plan
- LMS entities
- event entities
- public API entities

---

## 13. Requisitos não funcionais

### 13.1. Arquitetura
- sistema modular
- baixo acoplamento entre domínios
- capacidade de evolução incremental
- separação entre modelo interno e payloads externos

### 13.2. Auditoria
- logs de integração
- logs de eventos de venda
- histórico de mudança de campos críticos
- histórico de status em conversa, ticket, funil e direito adquirido

### 13.3. Performance
- busca rápida por contato, telefone, e-mail, CPF
- timeline eficiente por contato
- filtros por marca, canal, campanha e funil
- consultas gerenciais otimizadas para dashboards

### 13.4. Confiabilidade
- persistência de eventos externos
- tratamento de conflitos sem perda de histórico
- regras de decisão comercial determinísticas

### 13.5. Segurança
- autenticação de usuários internos
- trilha mínima de ações críticas no backend, mesmo sem módulo formal de auditoria na primeira fase
- preparação para políticas mais sofisticadas em fases futuras

---

## 14. Métricas de sucesso da fase 1

### Métricas de produto
- percentual de contatos consolidados corretamente
- redução de divergência de dados entre ferramentas
- adoção do CRM interno pelas áreas
- volume de conversas atendidas via inbox central
- percentual de vendas atribuídas corretamente a funil/campanha/criativo

### Métricas operacionais
- tempo de localização de contexto completo do contato
- redução de retrabalho entre comercial, suporte e financeiro
- tempo de resolução de conflitos de identidade
- taxa de preenchimento de origem de entrada e origem de conversão

### Métricas de negócio
- redução de dependência de ferramentas externas
- melhoria na leitura gerencial das vendas e campanhas
- melhor visibilidade de oportunidades por funil

---

## 15. Dependências externas

- documentação e payloads do Digital Guru
- configuração de eventos da Brevo
- configuração da WhatsApp API Oficial
- especificação da Notazz
- definição operacional dos eventos principais de Analytics

---

## 16. Riscos de produto e atenção de arquitetura

### 16.1. Identidade de contato
A regra de conflito entre telefone e e-mail é sensível e precisa de modelagem cuidadosa para evitar falsos merges e perda de rastreabilidade.

### 16.2. Motor comercial
A separação entre oferta, condição comercial, opção de pagamento e snapshot da compra é obrigatória. Simplificar demais esse módulo gerará retrabalho futuro.

### 16.3. Timeline e inbox
A experiência de caixa única por contato é crítica para adoção pelas equipes. A modelagem precisa equilibrar múltiplas conversas, múltiplos canais e contexto centralizado.

### 16.4. Integrações
O sistema não pode depender da forma como uma integração externa modela seus dados. A camada de mapeamento canônico é obrigatória.

---

## 17. Fora de escopo da fase 1

- LMS completo
- área de membros do aluno
- cadastro completo de cursos, módulos, aulas e trilhas para uso final do aluno
- eventos presenciais
- comissão comercial
- B2B multiusuário
- LGPD avançada
- automações acadêmicas
- API pública

---

## 18. Resumo executivo final

O Sistema Operacional da CNE Educação V2 será um produto multi-marca, orientado a CRM e funis, com identidade global de contatos, atendimento omnichannel, campanhas rastreáveis por criativo, pipeline comercial por funil, motor de ofertas dinâmicas com condições comerciais variáveis e registro imutável do que foi vendido.

Sua primeira fase não busca resolver a operação acadêmica final do aluno, mas sim criar o núcleo operacional que sustenta aquisição, relacionamento, venda, atendimento e consolidação gerencial da empresa.

Esse núcleo deve ser forte o suficiente para substituir ferramentas atuais, centralizar a operação e servir de base para os módulos futuros de LMS, eventos e expansão de produto.

