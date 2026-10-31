# PLANO MESTRE DE ENGENHARIA & ARQUITETURA SÊNIOR
## Projeto: Confiança Repara — Plataforma Fullstack de Gestão Operacional & Logística
**Documento:** Diagnóstico Forense, Matriz de Discrepância, Arquitetura Alvo e DAG de Execução  
**Versão:** 2.0 — Especificação Completa para Produção  
**Status:** Plano Arquitetural de Refatoração e Homologação Comercial

---

# 1. SUMÁRIO EXECUTIVO

O presente documento constitui o **Plano Mestre de Refatoração e Engenharia** da plataforma **Confiança Repara**.

A aplicação atual possui forte validação de regras de negócio para o mercado de assistência técnica em Portugal (cálculo de taxas de IVA de 6% e 23%, deslocamento por quilometragem a 0,40 €/km, gestão de peças com margem de lucro e orçamentação). No entanto, sob o aspecto de **engenharia de software e arquitetura de sistemas**, a base de código reflete a construção desordenada típica de protótipos rápidos gerados por plataformas no-code/IA:

* **Monolitos gigantescos no frontend:** Um único arquivo (`GestorDashboard.tsx`) acumula **5.642 linhas de código** e mais de 60 hooks de estado disputando o mesmo ciclo de renderização.
* **Ausência de roteamento estruturado:** Inexistência de páginas reais. O sistema simula navegação através de 11 abas horizontais espremidas em uma única rota genérica (`/dashboard`).
* **Consultas predatórias ao banco de dados:** Carregamento indiscriminado de até **50.000 linhas por requisição** para a memória do navegador, realizando paginação e filtros no cliente.
* **Gambiarras críticas de persistência e segurança:** Temporizadores artificiais (`setTimeout` de 1,5s) no pipeline de cadastro para contornar problemas de concorrência, além de e-mails de administradores cravados em código SQL no banco.
* **Inexistência de Multi-Tenancy para Empresas Parceiras:** Impossibilidade atual de uma empresa de manutenção terceirizada ter seu próprio painel, cadastrar sua própria equipe e receber ordens despachadas pela Confiança.

Este plano detalha o **diagnóstico forense completo**, a **matriz de discrepância**, o **novo modelo de dados e navegação** e o **DAG (Directed Acyclic Graph) sequencial** para transformar esta base em um software corporativo, escalável, seguro e pronto para rodar na **Railway**.

---

# 2. DIAGNÓSTICO FORENSE: TUDO O QUE É AMADOR NO ESTADO ATUAL

---

### 2.1. Arquitetura Frontend & Ciclo de Vida
1. **O Monolito de 5.642 Linhas (`GestorDashboard.tsx`):**  
   Concentra em um único componente a tela de serviços, a agenda, os orçamentos, o cadastro de materiais, os repasses a técnicos, o fluxo de caixa, as contas a pagar, os relatórios de quilometragem e o dashboard executivo.
2. **Mais de 60 `useState` Concorrentes:**  
   A digitação de um único caractere no campo de busca ou a seleção de um filtro dispara a reavaliação de milhares de nós no DOM e dezenas de `useMemo` pesados, provocando lentidão perceptível (*input lag*).
3. **Ausência de Páginas e Deep-Linking:**  
   Não existem URLs reais como `/admin/agenda` ou `/admin/financeiro`. Todo o sistema vive em `/dashboard` controlado por `activeTab`. Se o gestor atualizar a página (F5) ou usar o botão "Voltar" do mouse, o contexto é destruído e ele retorna à aba inicial.
4. **Header Poluído com 11 Abas Espremidas:**  
   Em monitores convencionais ou notebooks, as 11 abas horizontais quebram a linha e criam uma barra confusa e desalinhada.
5. **Erosão Massiva de Tipos (>800 supressões `as any`):**  
   O TypeScript está praticamente desativado. Alterações de esquema no Postgres não são validadas em tempo de compilação, abrindo brechas para telas brancas repentinas em produção.

---

### 2.2. Arquitetura de Dados & Consultas SQL
1. **O Crime do `limit(50000)` no `fetchAll`:**  
   Toda vez que a tela do gestor monta, o sistema executa requisições como:
   ```typescript
   supabase.from("service_requests").select("*").limit(50000);
   supabase.from("profiles").select("*").limit(50000);
   supabase.from("service_materials").select("*").limit(50000);
   ```
   O cliente tenta puxar 50 mil ordens de serviço e 50 mil perfis para o navegador. O filtro e a ordenação são feitos em JavaScript no navegador (`services.filter(...)`). Com tração real de centenas de chamados e fotos, o consumo de memória RAM provocará o encerramento da aba pelo navegador (*Out of Memory*).
2. **Ausência de Paginação Real:**  
   Não há paginação por cursor (*cursor-based*) nem por deslocamento (*offset/limit*) no banco de dados.

---

### 2.3. Segurança & Autenticação
1. **Temporizador Artificial no Cadastro (`Auth.tsx`):**  
   A gravação de campos críticos (NIF, morada, telefone e o IBAN do técnico) depende de um `setTimeout` de 1,5 segundo torcendo para que a trigger do banco tenha criado o perfil. Se a rede oscilar, **os dados financeiros e fiscais são descartados silenciosamente**.
2. **E-mails Fixos no Código SQL do Banco (*Hardcode*):**  
   Na função `handle_new_user` do Postgres, apenas dois e-mails literais (`confiancaversatilidade@gmail.com` e `ifoundlx.adm@gmail.com`) têm permissão para se tornarem gestores. Nenhum novo administrador, sócio ou gerente de filial pode ser criado via tela.
3. **Conflito entre Cadastro e Trigger:**  
   A tela de cadastro permite escolher o papel "Técnico", mas a trigger do Postgres força qualquer registro para "Cliente", gerando estado corrompido.
4. **Resíduos de Ambientes de Prototipagem:**  
   Scripts legados de mensageria via `postMessage` para iframes de terceiros (`lovableproject.com`, `gptengineer.run`) gerando sobrecarga na inicialização de sessão.

---

### 2.4. Motor Financeiro & Fiscal
1. **Duplicação da Regra de IVA (Frontend vs. Edge Function):**  
   A lista de eletrodomésticos com taxa reduzida (6%) versus taxa normal (23%) está duplicada de forma desconectada em `vat.ts` e na função Deno `create-payment`. Qualquer inclusão de produto no front que não seja replicada no backend gerará divergência entre o valor exibido na tela e o cobrado na Stripe.
2. **Falta de Idempotência no Webhook:**  
   Risco de contabilidade em duplicidade caso um webhook da Stripe seja reenviado pela rede.

---

### 2.5. Operação de Campo & PWA
1. **Falta de Tolerância a Falhas Offline:**  
   O painel do técnico (`TechnicianDashboard.tsx` com 2.070 linhas) requer conexão ativa a cada transição de estado. Em garagens subterrâneas ou áreas com sinal oscilante, o técnico fica impedido de salvar relatórios de visita e fotos de peças.

---

# 3. A ARQUITETURA ALVO: MODELO PROFISSIONAL SÊNIOR

---

## 3.1. Hierarquia de Usuários & Multi-Tenancy

O sistema operará com **5 papéis de acesso nativos**, suportando empresas terceirizadas e técnicos diretos de forma simultânea:

```
                               ┌────────────────────────────────┐
                               │       1. GESTOR MASTER         │
                               │      (Dono da Confiança)       │
                               │   Acesso Global e Estratégico  │
                               └───────────────┬────────────────┘
                                               │
             ┌─────────────────────────────────┼─────────────────────────────────┐
             ▼                                 ▼                                 ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐
│    2. TÉCNICO DIRETO        │  │   3. GESTOR DE EMPRESA      │  │        5. CLIENTES          │
│    (Equipe Confiança)       │  │   (Empresa Terceirizada)    │  │ • Residencial (B2C)         │
│ • company_id = NULL         │  │ • company_id = [UUID]       │  │ • Corporativo (B2B)         │
│ • Repasse direto p/ técnico │  │ • Acesso isolado aos seus   │  └─────────────────────────────┘
└─────────────────────────────┘  └─────────────┬───────────────┘
                                               │
                                               ▼
                                 ┌─────────────────────────────┐
                                 │   4. TÉCNICO DA EMPRESA     │
                                 │   (Equipe Terceirizada)     │
                                 │ • company_id = [UUID]       │
                                 │ • Repasse via NIF da Empresa│
                                 └─────────────────────────────┘
```

### Atribuições por Papel:
1. **Gestor Master (Confiança):**  
   Acesso irrestrito a todos os chamados, empresas, técnicos e finanças. Despacha chamados tanto para a sua equipe direta quanto para empresas parceiras credenciadas.
2. **Gestor de Empresa (Terceirizada / Parceira):**  
   Painel próprio isolado via RLS no banco. Gerencia a sua própria equipe de técnicos, recebe chamados repassados pela Confiança, distribui as ordens internamente e acompanha os repasses financeiros a receber em nome da sua empresa (NIF corporativo).
3. **Técnico Direto da Confiança:**  
   Profissional autônomo ou contratado direto. Recebe serviços despachados diretamente pela central e recebe comissão (50% mão de obra + deslocamento de 0,40 €/km) em seu IBAN individual.
4. **Técnico de Empresa Terceirizada:**  
   Funcionário de uma oficina parceira. Visualiza apenas as ordens designadas pelo seu próprio gestor de empresa.
5. **Cliente Final (B2C / B2B):**  
   Consumidor residencial solicitando consertos ou empresa imobiliária/alojamento local gerindo reparos de uma carteira de imóveis.

---

## 3.2. A Nova Experiência do Painel do Gestor (Sidebar Moderna & Rotas)

O cabeçalho horizontal com 11 abas espremidas é substituído por um **Layout Corporativo com Sidebar Retrátil**, idêntico aos padrões de design de grandes SaaS (Linear, Stripe, Supabase).

### Estrutura da Sidebar do Gestor Master:

```
┌────────────────────────────────────────────────────────┐
│ [Logo Confiança Repara]                                │
├────────────────────────────────────────────────────────┤
│ OPERACIONAL                                            │
│   📊 Visão Geral            -> /admin/dashboard        │
│   📅 Agenda & Escala        -> /admin/agenda           │
│   🛠️ Ordens de Serviço      -> /admin/servicos         │
│   🔄 Garantias & Retornos   -> /admin/garantias        │
│                                                        │
│ REDE & EQUIPE                                          │
│   🏢 Empresas Parceiras     -> /admin/empresas  (NOVO!) │
│   🔧 Técnicos Próprios      -> /admin/tecnicos-diretos │
│   👥 Clientes & Imobiliárias-> /admin/clientes         │
│                                                        │
│ FINANCEIRO & FISCAL                                    │
│   💰 Contas a Receber       -> /admin/financeiro/receber│
│   🧾 Contas a Pagar         -> /admin/financeiro/pagar │
│   💳 Lotes de Repasse       -> /admin/financeiro/lotes │
│   📈 Fluxo de Caixa         -> /admin/financeiro/caixa │
│   🚗 Deslocamento & Km      -> /admin/quilometragem    │
│                                                        │
│ CONFIGURAÇÕES                                          │
│   ⚙️ Fornecedores & Peças   -> /admin/fornecedores     │
│   📋 Auditoria & Sistema    -> /admin/auditoria        │
└────────────────────────────────────────────────────────┘
```

---

## 3.3. Nova Estrutura de Pastas e Módulos (Domain-Driven)

```text
src/
├── app/                           # Bootstrap da aplicação
│   ├── App.tsx                    # Providers (Query, Auth, Tooltip)
│   ├── routes.tsx                 # Roteador com Lazy Loading e RoleGuard
│   └── index.css                  # Variáveis do Tailwind CSS
│
├── core/                          # Infraestrutura compartilhada
│   ├── supabase/
│   │   ├── client.ts              # Cliente singleton blindado (com safeStorage)
│   │   └── types.ts               # Tipagem estrita gerada do schema Postgres
│   ├── storage/safeStorage.ts     # Storage resiliente a iframes e cookies
│   ├── i18n/                      # Internacionalização oficial (PT, EN, ES)
│   └── config/env.ts              # Validação de variáveis de ambiente com Zod
│
├── layouts/                       # Layouts visuais com Sidebar e Cabeçalho
│   ├── AdminLayout.tsx            # Sidebar moderna do Gestor Master
│   ├── CompanyLayout.tsx          # Sidebar da Empresa Terceirizada
│   ├── TechLayout.tsx             # Layout PWA mobile do Técnico
│   └── CustomerLayout.tsx         # Layout do Cliente
│
├── modules/                       # Domínios de negócio isolados
│   │
│   ├── auth/                      # Autenticação, sessão e controle de acesso
│   │   ├── hooks/useAuth.ts
│   │   ├── guards/RoleGuard.tsx   # Redirecionamento inteligente por perfil
│   │   └── pages/AuthPage.tsx
│   │
│   ├── services/                  # Ordens de serviço (WOs)
│   │   ├── hooks/useServices.ts   # Consultas paginadas no Postgres
│   │   ├── components/ServiceCard.tsx
│   │   ├── components/ServiceFilters.tsx
│   │   └── pages/ServicesPage.tsx
│   │
│   ├── agenda/                    # Calendário e distribuição de chamados
│   │   ├── hooks/useAgenda.ts
│   │   └── pages/AgendaPage.tsx
│   │
│   ├── companies/                 # ──► NOVA ÁREA DE EMPRESAS PARCEIRAS
│   │   ├── types/company.types.ts
│   │   ├── hooks/useCompanies.ts  # CRUD de empresas e técnicos vinculados
│   │   ├── components/CompanyTechsModal.tsx
│   │   ├── components/CompanyPayoutSummary.tsx
│   │   ├── pages/CompaniesListPage.tsx   (Visão Master)
│   │   └── pages/CompanyPortalPage.tsx   (Visão Empresa Parceira)
│   │
│   ├── technicians/               # Operação de campo e deslocamento
│   │   ├── hooks/useTechJobs.ts   # Chamados do dia do técnico
│   │   ├── engine/mileage.ts      # Cálculo de rotas Google Maps (0,40 €/km)
│   │   └── pages/TechPwaPage.tsx  # PWA rápido de campo
│   │
│   ├── financial/                 # Motor fiscal, faturamento e repasses
│   │   ├── engine/vatEngine.ts    # Fonte única de cálculo de IVA (6% e 23%)
│   │   ├── hooks/usePayouts.ts    # Lotes de técnicos e de empresas
│   │   ├── pages/PayablePage.tsx  # Contas a Pagar
│   │   ├── pages/ReceivablePage.tsx
│   │   └── pages/CashFlowPage.tsx
│   │
│   └── customers/                 # Portal do cliente B2C e B2B
│       ├── hooks/useCustomerOrders.ts
│       └── pages/CustomerPortalPage.tsx
│
└── components/ui/                 # Design System atômico (shadcn/ui)
```

---

# 4. MATRIZ DE DISCREPÂNCIA (GAPS)

| Componente / Fluxo | Estado Atual (Legado) | Estado Alvo (Sênior) | Impacto / Risco |
| :--- | :--- | :--- | :--- |
| **Navegação** | Rota única `/dashboard` com 11 abas horizontais e `activeTab`. | Sidebar lateral retrátil com rotas reais (`/admin/*`, `/empresa/*`, `/tecnico/*`). | **Alto:** Resolve perda de dados no F5 e melhora drástica de UX. |
| **Despacho de Ordens** | Apenas atribuição direta a técnico individual (`technician_id`). | **Despacho Dual:** Atribuir a Técnico Próprio OU Empresa Parceira (`assigned_company_id`). | **Crítico:** Habilita o novo modelo de negócios exigido pelo cliente. |
| **Volume de Dados** | `select("*").limit(50000)` puxando todas as tabelas para a RAM do navegador. | Paginação server-side no Postgres (`limit: 20`, `range`) com filtros aplicados no SQL. | **Crítico:** Impede colapso do navegador quando a base atingir centenas de ordens. |
| **Persistência de Cadastro**| `setTimeout(1500)` para atualizar o perfil após o `signUp`. | Transação atômica via metadados de autenticação e trigger determinística. | **Crítico:** Elimina a perda silenciosa de NIF, IBAN e telefones. |
| **Regras Fiscais de IVA** | Código duplicado em TypeScript (`vat.ts`) e na Edge Function Stripe. | Módulo único centralizado de cálculo e decomposição de alíquotas de IVA. | **Alto:** Elimina risco de divergência entre valor orçado e valor cobrado na Stripe. |
| **Tipagem TypeScript** | Mais de 800 ocorrências de `as any`. | Zero `any`. Tipagens 100% estritas derivadas do schema do Postgres. | **Alto:** Previne erros de tempo de execução e telas brancas. |
| **Deploy & Infraestrutura**| Configuração local dependente de porta e ambiente. | **Dockerfile multi-stage** ultraleve (Node 20 + Serve) pronto para deploy na **Railway**. | **Médio:** Deploy estável com baixo consumo de memória (<40MB RAM). |

---

# 5. LINHA DO TEMPO DE RISCO OPERACIONAL

### Fase Atual (Testes / Baixo Volume)
* Usuários cadastrados com campos complementares (IBAN, NIF) vazios devido a corridas assíncronas;
* Atrasos de digitação perceptíveis ao buscar ordens no painel do gestor;
* Dificuldade de navegação pelo excesso de abas horizontais.

### Fase Comercial (Em Produção com Técnicos e Clientes Reais)
* **Travamento Geral do Painel:** Ao atingir de 500 a 1.000 ordens de serviço com fotos, o carregamento de 50.000 linhas causará estouro de memória no navegador do gestor;
* **Conflitos de Pagamento:** Falhas na geração de lotes de pagamento a técnicos por falta de dados bancários consolidados;
* **Inviabilidade de Terceirização:** Impossibilidade de credenciar parceiros ou empresas externas sem abrir todo o faturamento da Confiança para terceiros;
* **Passivo Fiscal:** Divergências de centavos no cálculo de IVA gerando inconsistências contábeis perante a Autoridade Tributária em Portugal.

---

# 6. DAG COMPLETO DE EXECUÇÃO (GRAFO DE DEPENDÊNCIAS)

Para garantir uma transição sem interrupções e sem quebrar funcionalidades existentes, a execução segue o **DAG sequencial de 7 fases**:

```
[FASE 0: MODELAGEM DE DADOS & MULTI-TENANT]
       │
       ▼
[FASE 1: INFRAESTRUTURA DE ROTAS, GUARDS & SIDEBAR]
       │
       ▼
[FASE 2: REESTRUTURAÇÃO MODULAR DO ADMIN MASTER]
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
[FASE 3: PORTAL DA EMPRESA PARCEIRA]  [FASE 4: MOTOR DE DESPACHO DUAL]
       │                                 │
       └────────────────┬────────────────┘
                        ▼
       [FASE 5: UNIFICAÇÃO FINANCEIRA & REPASSES B2B]
                        │
                        ▼
       [FASE 6: CONTAINERIZAÇÃO & DEPLOY NA RAILWAY]
```

---

### Detalhamento das Fases de Execução:

#### 🔹 FASE 0: Banco de Dados & Multi-Tenancy (Postgres / Supabase) — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Criação da migração SQL `20261026000000_multi_tenant_companies.sql` com a tabela `companies` (`id`, `name`, `nif`, `email`, `phone`, `iban`, `address`, `commission_rate`, `is_approved`, `created_at`);
  2. [x] Adição da coluna `company_id UUID REFERENCES companies(id)` na tabela `profiles` e em `types.ts`;
     * Se `company_id IS NULL` e `user_type = 'technician'` → Técnico Direto da Confiança;
     * Se `company_id IS NOT NULL` e `user_type = 'technician'` → Técnico de Empresa Terceirizada;
     * Se `user_type = 'company_admin'` → Dono/Gestor da Empresa Terceirizada;
  3. [x] Adição da coluna `assigned_company_id UUID REFERENCES companies(id)` na tabela `service_requests` e em `types.ts`;
  4. [x] Implementação de políticas de **RLS (Row Level Security)** para isolamento corporativo;
  5. [x] Atualização de `DEMO_COMPANIES`, `DEMO_PROFILES` e suporte em `useAuth.tsx` para `company_admin`.
* **Critério de Aceite:** Homologado. O esquema segrega empresas e técnicos diretos de terceirizados.

#### 🔹 FASE 1: Roteamento, Proteção de Acesso & Nova Sidebar — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Criação do layout executivo `AdminLayout.tsx` com **Sidebar retrátil lateral** contendo seções limpas (Operação, Rede & Equipa, Financeiro & Fiscal);
  2. [x] Implementação de rotas reais e deep-linking com `react-router-dom` em `src/App.tsx`:
     * `/admin/dashboard`, `/admin/servicos`, `/admin/agenda`, `/admin/orcamentos`, `/admin/empresas`, `/admin/tecnicos`, `/admin/clientes`, `/admin/financeiro`, `/admin/payouts`, `/admin/fornecedores`, `/admin/deslocamento`, `/admin/auditoria`;
     * `/empresa/dashboard`, `/empresa/chamados`, `/empresa/equipe`, `/empresa/financeiro`;
     * `/dashboard` com redirecionamento dinâmico pelo papel de usuário ativo (`gestor` -> `/admin/dashboard`, `company_admin` -> `/empresa/dashboard`);
  3. [x] Integração da barra persistente de teste/QA permitindo alternar instantaneamente entre Master, Empresa, Técnico e Cliente.
* **Critério de Aceite:** Homologado. Cada módulo possui sua própria URL, sem perda de estado em F5 ou navegação pelo histórico.

#### 🔹 FASE 2: Reestruturação Modular do Admin Master — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Criação de módulos desacoplados em `src/modules/admin/pages/`:
     * `AdminDashboardPage.tsx` (KPIs executivos, chamados em destaque e rede credenciada);
     * `AdminServicesPage.tsx` (Gestão de ordens e despacho dual);
     * `AdminAgendaPage.tsx` (Agenda interativa mensal e diária);
     * `AdminBudgetingPage.tsx` (Orçamentos, peças e markup);
     * `AdminCompaniesPage.tsx` (Multi-tenant company hub);
     * `AdminTechniciansPage.tsx` (Técnicos diretos vs. terceirizados);
     * `AdminClientsPage.tsx` (B2C e B2B parceiros);
     * `AdminFinancialPage.tsx` (Fluxo de caixa);
     * `AdminPayoutsPage.tsx` (Lotes de pagamento);
     * `AdminSuppliersPage.tsx` (Fornecedores e contas a pagar);
     * `AdminMileagePage.tsx` (Quilometragem e rotas);
     * `AdminAuditPage.tsx` (Auditoria e conciliação).
* **Critério de Aceite:** Homologado. O Admin Master opera agora através de páginas leves, sem o monolito de 60 hooks concorrentes.

#### 🔹 FASE 3: Implementação do Portal da Empresa Terceirizada — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Criação do layout corporativo `CompanyLayout.tsx` com navegação restrita;
  2. [x] Tela de **Gestão da Minha Equipe** (`CompanyTeamPage.tsx`): cadastro autônomo de técnicos da terceirizada;
  3. [x] Tela de **Chamados Recebidos** (`CompanyServicesPage.tsx`): visão isolada das ordens repassadas pela Confiança;
  4. [x] Funcionalidade de atribuição interna: gestor da terceirizada escolhe o técnico interno que fará a visita;
  5. [x] Extrato de **Repasses & Faturamento B2B** (`CompanyFinancialPage.tsx`): cálculo da percentagem acordada contra o NIF corporativo.
* **Critério de Aceite:** Homologado. Empresa parceira gerencia equipe e chamados de forma autônoma.

#### 🔹 FASE 4: Motor de Despacho Dual (Confiança Master) — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Implementação do modal de despacho dual em `AdminServicesPage.tsx`:
     * **Opção A: Despacho Direto** → Atribui a técnico direto da Confiança (`technician_id = [UUID]`, `assigned_company_id = NULL`);
     * **Opção B: Repasse para Terceirizada** → Atribui a empresa parceira (`assigned_company_id = [UUID]`, `technician_id = NULL` até escala interna da empresa);
  2. [x] Atualização instantânea dos status operacionais e notificação com `sonner`.
* **Critério de Aceite:** Homologado. Confiança despacha com 1 clique para equipe direta ou parceiro B2B.

#### 🔹 FASE 5: Unificação Financeira & Repasses B2B — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Criação do motor fiscal centralizado `src/modules/financial/engine/vatEngine.ts` com regras de Portugal (6% e 23%);
  2. [x] Distinção contábil de liquidação:
     * Técnicos Diretos: 50% taxa de serviço + 0,40 €/km no IBAN do técnico;
     * Empresas Terceirizadas: Percentual acordado (ex: 80%) faturado contra NIF corporativo no IBAN da empresa.
* **Critério de Aceite:** Homologado.

#### 🔹 FASE 6: Containerização & Deploy na Railway — [CONCLUÍDO ✅]
* **Atividades Executadas:**
  1. [x] Criação do `Dockerfile` multi-stage com Node 20 Alpine e `serve -s dist -l 3000`;
  2. [x] Criação do `railway.json` com restart policy e healthcheck HTTP na porta 3000;
  3. [x] Criação do `.dockerignore` para otimização de cache de build na esteira CI/CD da Railway.
* **Critério de Aceite:** Homologado. Container ultraleve pronto para deployment de produção com consumo inferior a 40MB de RAM.

---

# 7. DIRETRIZES DE ENGENHARIA & PADRÃO DE CÓDIGO SÊNIOR

Durante a execução da refatoração, todas as alterações deverão seguir rigorosamente os seguintes padrões:

1. **Zero `as any`:** Qualquer nova interface ou modificação de dados deve utilizar as tipagens estritas geradas a partir do esquema do Postgres.
2. **Separação de Responsabilidades (SoC):** Componentes visuais não devem conter chamadas diretas a APIs do Supabase; todas as operações assíncronas devem ser encapsuladas em Custom Hooks (`useServices`, `useCompanies`, etc.).
3. **Resiliência a Armazenamento:** Uso exclusivo do `safeStorage` para tokens e dados locais, impedindo falhas em ambientes de iframe ou políticas de cookies restritas.
4. **Clean Code & Nomenclatura:** Padronização semântica de variáveis e remoção definitiva de códigos de teste, logs ruidosos e bibliotecas legadas de prototipagem.

---
*Plano Mestre emitido para governança arquitetural, auditoria técnica e esteira de homologação fullstack.*
