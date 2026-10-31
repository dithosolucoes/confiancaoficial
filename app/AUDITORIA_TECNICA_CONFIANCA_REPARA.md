# LAUDO TÉCNICO DE AUDITORIA, QA E AVALIAÇÃO DE PRONTIDÃO OPERACIONAL
### Plataforma: Confiança Repara — Gestão de Serviços Técnicos

---

| Metadado | Detalhe |
| :--- | :--- |
| **Projeto** | Confiança Repara (Assistência Técnica & Gestão de Ordens) |
| **Tipo de Auditoria** | Auditoria Estrutural de Arquitetura, Banco de Dados, Segurança e QA |
| **Ambiente Analisado** | Repositório Principal / Versão Pré-Produção |
| **Data de Emissão** | 08 de Outubro de 2026 |
| **Classificação Global** | ⚠️ **REPROVADO PARA PRODUÇÃO COMERCIAL IMEDIATA** |
| **Nível de Risco Operacional** | **ELEVADO (Falhas de Persistência, Fiscal e Performance)** |

---

## 1. SUMÁRIO EXECUTIVO

O presente documento consolida o laudo da auditoria técnica independente realizada sobre a base de código e infraestrutura da plataforma **Confiança Repara**.

A solução apresenta elevado valor de negócio, com proposta comercial sólida para o mercado de assistência técnica em Portugal, excelente apresentação visual e fluxos operacionais bem concebidos (gestão de peças, mão de obra, agendamentos, rotas e regras de IVA).

Contudo, a inspeção aprofundada de engenharia de software revelou que o sistema se encontra em **estágio de protótipo de alta fidelidade gerado e remendado por plataformas de aceleração rápida**. A aplicação carrega **dívidas técnicas profundas, vulnerabilidades silenciosas de gravação de dados, dessincronização de regras fiscais e hipertrofia arquitetural**.

A liberação da plataforma no estado atual diretamente ao público final e à equipe de técnicos acarretará **perda invisível de dados cadastrais (NIF, moradas e IBAN), divergências em liquidações da Stripe, travamento progressivo do painel do gestor e riscos de conformidade tributária**.

---

## 2. MATRIZ DE RISCO TÉCNICO E IMPACTO NO NEGÓCIO

| ID | Área Crítica | Descrição do Problema | Severidade | Impacto no Negócio |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Cadastro & Perfis** | Corrida assíncrona com temporizador artificial na gravação de dados |  **CRÍTICO** | Perda invisível de NIF, IBAN de técnicos e contatos no momento do registro. |
| **FIN-01** | **Fiscal & Stripe** | Descompasso e duplicação da lógica de IVA entre interface e checkout |  **CRÍTICO** | Divergência de cêntimos entre valor exibido e cobrado; estornos e risco fiscal. |
| **DB-01** | **Banco de Dados** | E-mails fixos gravados em triggers SQL e >80 migrações sobrepostas |  **CRÍTICO** | Impossibilidade de cadastrar novos gestores e conflitos de regras no banco. |
| **PERF-01**| **Arquitetura Front** | Componente monolítico central com mais de 5.600 linhas de código |  **ALTO** | Lentidão na digitação, alto consumo de memória e travamento com volume de dados. |
| **NAV-01** | **Rotas & Navegação** | Centralização cega em rota única (`/dashboard`) sem deep-linking |  **ALTO** | Impossibilidade de compartilhar links diretos; botão "Voltar" desloga o usuário. |
| **TYP-01** | **Integridade de Tipos** | Supressão massiva de segurança de dados (>800 ocorrências ativas) | **ALTO** | Telas brancas (*crashes*) súbitas no navegador ao carregar campos nulos. |
| **DEP-01** | **Ambiente & Marca** | Vínculos residuais com iframes e metadados de plataformas de teste |  **MÉDIO** | Atraso no boot de sessão e cards de compartilhamento com marca de terceiros. |
| **QA-01** | **Confiabilidade** | Ausência de cobertura de testes automatizados em esteira de receita |  **MÉDIO** | Impossibilidade de garantir que novas funções não quebrem as existentes. |

---

## 3. DIAGNÓSTICO DETALHADO DOS PILARES CRÍTICOS

---

### 3.1. [SEC-01] PILAR CADASTRAL: CORRIDA ASSÍNCRONA E PERDA SILENCIOSA DE DADOS
* **Diagnóstico Técnico:** O pipeline de registro de novos usuários possui um mecanismo de atraso artificial por temporizador para tentar sincronizar a criação do usuário com o preenchimento de seus campos complementares.
* **A Falha na Prática:** Caso a conexão 4G/Wi-Fi do usuário apresente latência, caso o dispositivo móvel seja modesto ou caso o usuário feche/mude de tela nos primeiros segundos após clicar em "Cadastrar", a requisição de atualização é abortada no limbo da rede.
* **Impacto Operacional:** O sistema informa *"Conta criada com sucesso"*, mas **o telefone, morada, NIF de faturamento e o IBAN bancário do técnico deixam de ser salvos**. O gestor visualiza fichas vazias e é forçado a contatar usuários manualmente para solicitar dados financeiros via canais informais.

---

### 3.2. [FIN-01] PILAR FISCAL & STRIPE: DIVERGÊNCIA DE CÁLCULO E MOTOR DUAL
* **Diagnóstico Técnico:** A tabela de segregação de taxas de IVA (alíquota reduzida de 6% para reparações essenciais versus taxa geral de 23% para os demais serviços) foi codificada em duplicidade isolada: uma versão opera na camada visual do navegador e outra versão idêntica opera no ambiente de nuvem que gera a cobrança da Stripe.
* **A Falha na Prática:** Não há uma fonte única da verdade para as regras financeiras. Se houver divergências de arredondamento, inclusão de novas categorias de equipamentos ou itens adicionais de orçamento em apenas uma das pontas, o cliente visualizará uma quantia no orçamento e terá seu cartão debitado por um valor divergente.
* **Impacto Operacional:** Exposição direta a contestações de compras (*chargebacks* bancários), perda de credibilidade com o cliente e inconsistências perante as exigências da Autoridade Tributária (AT) em Portugal.

---

### 3.3. [DB-01] PILAR DE BANCO DE DADOS: GOVERNANÇA ENGESSADA E FRAGMENTAÇÃO
* **Diagnóstico Técnico:** O banco de dados acumula um histórico de mais de **80 arquivos de migração sequenciais**, com reescritas contínuas de triggers, permissões e tabelas.
* **A Falha na Prática:** Identificou-se que regras de concessão de papéis de gestor possuem **endereços de e-mail literais cravados no código-fonte das funções do Postgres**. Adicionalmente, a regra do banco conflita com a tela de registro, rebaixando automaticamente técnicos cadastrados para o perfil de cliente comum sem sincronia com o estado da interface.
* **Impacto Operacional:** A empresa não consegue promover novos gerentes, sócios ou administradores sem que um especialista altere scripts no console do banco. Há risco latente de regressão de segurança devido a políticas de segurança de linha (RLS) sobrepostas.

---

### 3.4. [PERF-01] PILAR FRONTEND: HIPERTROFIA ARQUITETURAL E MONOLITOS
* **Diagnóstico Técnico:** O núcleo operacional do gestor (`GestorDashboard`) concentra **5.642 linhas de código** em uma única unidade de arquivo. Situação similar ocorre no painel do técnico (2.070 linhas) e do cliente (1.839 linhas).
* **A Falha na Prática:** Uma arquitetura React não modularizada faz com que cada interação do usuário (digitação em filtros, seleção de datas ou expansão de cards) force a recalculação em cascata de centenas de rotinas simultâneas na memória do navegador.
* **Impacto Operacional:** Conforme o banco acumule centenas de ordens de serviço, fotos de vistorias e deslocamentos de técnicos, a página do gestor apresentará **engasgos severos de digitação, consumo desproporcional de memória RAM e congelamentos frequentes**, inviabilizando o uso em computadores corporativos convencionais.

---

### 3.5. [NAV-01] PILAR DE NAVEGAÇÃO: ARQUITETURA DE ROTAS E DEEP-LINKING
* **Diagnóstico Técnico:** Os três perfis de acesso da empresa (Gestor, Técnico e Cliente) operam sob o mesmo caminho raiz (`/dashboard`). O controle de telas é feito unicamente por estados voláteis de memória e não por roteamento estruturado.
* **A Falha na Prática:** 
  1. **Ausência de Links Diretos:** O gestor não consegue enviar o link de um orçamento ou serviço específico para um colega; o link sempre aponta para o início genérico.
  2. **Quebra do Histórico:** Ao clicar no botão "Voltar" do navegador ou do mouse, a aplicação não volta para a aba anterior — ela encerra a navegação e sai do sistema.
  3. **Sobrecarga de Download:** O cliente comum baixa no smartphone todo o código dos painéis financeiros do gestor, aumentando o tempo de carregamento da aplicação móvel.

---

### 3.6. [TYP-01] PILAR DE INTEGRIDADE: SUPRESSÕES DE TIPAGEM E FRAGILIDADE
* **Diagnóstico Técnico:** A auditoria estática identificou **mais de 800 pontos de código** onde a checagem rigorosa de tipos do compilador foi intencionalmente desativada por supressão genérica.
* **A Falha na Prática:** Isso demonstra que as alterações feitas nas tabelas do banco não foram refletidas nas interfaces de dados do software. O sistema opera sem validação em tempo de compilação.
* **Impacto Operacional:** Qualquer campo que retorne nulo, não preenchido ou com formato inesperado do banco provoca **erros não tratados em tempo de execução**, resultando na clássica tela branca de travamento para o usuário.

---

### 3.7. [DEP-01] PILAR DE INFRAESTRUTURA: RESÍDUOS DE AMBIENTES DE TESTES
* **Diagnóstico Técnico:** A camada de gerenciamento de sessão ainda carrega códigos de ponte para iframes e domínios de depuração de ferramentas de prototipagem rápida de terceiros.
* **Impacto Operacional:** Em domínio comercial próprio, esses scripts tentam trocar mensagens com janelas inexistentes antes de inicializar a sessão real, gerando overhead na inicialização do aplicativo e mantendo metadados de compartilhamento externos desvinculados da marca oficial da empresa.

---

## 4. LINHA DO TEMPO DE IMPACTO OPERACIONAL

###  Cenário I: Sintomas no Uso Inicial (Hoje)
* Ocorrência de cadastros com telefones, moradas ou IBAN em branco.
* Pequenos engasgos perceptíveis ao alternar abas no painel do gestor.
* Divergências ocasionais de centavos entre resumos de tela e fechamentos.
* Necessidade de recarregar a página (F5) caso uma tela branca ocorra ao consultar chamados antigos.

###  Cenário II: Riscos com Tração Comercial (Com 10+ Técnicos e Volume de Ordens)
* **Travamento Operacional:** O navegador do gestor congela ao processar o volume acumulado de ordens de serviço e fotos.
* **Conflito Financeiro com Técnicos:** Lotes de pagamento e relatórios de deslocamento processados com dados inconsistentes ou IBANs não localizados, gerando desgaste com a equipe de campo.
* **Contestações de Pagamento:** Clientes contestando valores de faturamento junto à operadora do cartão de crédito por incompatibilidade com o orçamento aprovado.
* **Inviabilidade de Evolução:** Dificuldade extrema para implementar novas telas ou integrar com novos softwares de faturamento sem introduzir bugs em cascata.

---

## 5. ESCOPO DA FASE DE HOMOLOGAÇÃO E ENGENHARIA ESTRUTURAL

Para transformar a base de código em uma plataforma comercial segura, profissional e escalável, é necessária a execução de um programa de homologação técnica dividido em 6 eixos de atuação:

```
[1. BLINDAGEM DE CADASTRO] ──► Eliminação de corridas assíncronas; persistência transacional atômica.
[2. MOTOR FINANCEIRO ÚNICO] ─► Unificação centralizada das regras de IVA, orçamentos e Stripe.
[3. GOVERNANÇA DE BANCO]   ──► Saneamento das migrations, expurgo de hardcodes e revisão de RLS.
[4. MODULARIZAÇÃO DE CÓDIGO] ─► Desmembramento dos monolitos (>5.600 linhas) em submódulos de alta velocidade.
[5. ARQUITETURA DE ROTAS]   ──► Implementação de rotas protegidas independentes e deep-linking.
[6. DESACOPLAMENTO & BRAND] ──► Expurgar amarras de terceiros e blindagem de segurança de dados.
```

### Garantias Entregues após a Homologação:
1. **Confiabilidade Cadastral:** 100% dos dados bancários, fiscais e de contato gravados com integridade garantida.
2. **Precisão Fiscal e de Pagamentos:** Total sincronia entre valores apresentados, recibos emitidos e cobranças da Stripe.
3. **Fluidez e Escalabilidade:** Painel do gestor ágil e otimizado para suportar milhares de registros sem engasgos de tela.
4. **Independência Tecnológica:** Software livre de amarras de ferramentas de teste, com segurança de dados estrita e pronto para operar sob o domínio corporativo oficial.

---

## 6. PARECER CONCLUSIVO

A plataforma **Confiança Repara** reúne excelentes premissas de negócio e interface visual elegante, mas seu núcleo técnico atual carece da robustez indispensável para uma operação comercial ao vivo.

A execução da **Fase de Homologação e Engenharia Estrutural** não representa um mero ajuste cosmético, mas sim a **blindagem indispensável para prevenir prejuízos financeiros, retrabalho operacional e danos à reputação da empresa** junto a clientes e técnicos.

---
*Laudo técnico emitido para fins de auditoria estrutural e segurança operacional.*
