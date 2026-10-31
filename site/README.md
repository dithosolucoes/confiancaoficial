# Site Confiança Manutenção

Site institucional estático (HTML), gerado a partir dos dados em `_build/data/`.

## Estrutura

- `index.html`, `servicos.html`, `areas-atendidas.html`, `contato.html` — páginas principais
- `servicos/*.html` — uma página por serviço ativo (17 páginas; ver "Serviços desativados" abaixo)
- `zonas/*.html` — uma página por cidade/concelho atendido (12 páginas)
- `images/logo.png` — logótipo
- `assets/styles.css` — cores da marca e estilos personalizados
- `_build/` — gerador do site (não precisa de ir para o servidor/hospedagem)

## Como editar o site

Não edite os ficheiros `.html` diretamente — eles são **gerados automaticamente**.
Edite os dados e gere novamente:

1. `_build/data/config.js` — nome, telefone, WhatsApp, morada, link da app, link de registo de técnicos (`technicianSignupUrl`)
2. `_build/data/services.js` — categorias, serviços, descrições e preços
3. `_build/data/locations.js` — cidades/zonas atendidas
4. Textos fixos da página inicial e do rodapé (título, garantia, "Sobre Nós", faixa de técnicos) — diretamente em `_build/generate.js`

Depois, na pasta `_build`, execute (requer Node.js):

```
node generate.js
```

Isto recria todas as páginas `.html` com os dados atualizados.

**Atenção:** o gerador cria e atualiza páginas, mas não apaga as antigas. Ao desativar ou remover um serviço, apague também o ficheiro `servicos/<slug>.html` correspondente.

### Opções de cada serviço (`services.js`)

| Campo | Para que serve |
|---|---|
| `priceFrom` | Preço mostrado. Sem `priceFixed`, aparece como "A partir de …"; `null` mostra "Sob consulta" |
| `priceFixed: true` | Mostra o preço sem "A partir de" (preço fixo) |
| `priceNote` | Nota por baixo do preço |
| `visitOnly: true` | Serviços em que o preço é só visita + diagnóstico; mostra a nota sobre orçamento da reparação |
| `priceTable` | Tabela de preços (ex.: por tipologia T0–T8) na caixa de preço |
| `notIncluded` | Lista "Não incluído neste serviço" |
| `disabled: true` | Esconde o serviço do site (sem página nem cartões) sem apagar os dados |

Uma **categoria** com `disabled: true` esconde a categoria e todos os seus serviços. Categorias sem serviços ativos não aparecem.

Os 9 primeiros serviços ativos da lista aparecem em "Serviços Mais Pedidos" (página inicial) e nas páginas das zonas.

## Serviços desativados (temporariamente)

Os dados continuam em `services.js`; para reativar, apague a linha `disabled: true` e gere o site de novo.

- **Categoria Elétrica Geral** — Tomadas, Interruptores, Quadro Elétrico e Disjuntores, Candeeiros e Lustres, Ventilador de Teto, Análise de Curto-Circuito
- **Categoria Canalização** — Torneira de WC, Torneira de Cozinha, Desentupimento de WC, Desentupimento de Cozinha, Torneira de Segurança, Bichas da Pia
- **Categoria Montagens e Fixações** — Suporte de TV, Pendurar Quadros, Montagem de Móveis IKEA
- **Limpeza de Casa** (categoria Limpeza) — preço por tipologia T0–T8 (29,90€ a 149,90€) + produtos de limpeza opcionais (5,90€); estrutura e preços baseados no serviço "Limpeza de casa" da app OSCAR (preços de tabela de out/2026, sem promoção)

## Decisões já aplicadas

- CTA principal: **"Agendar pela App Confiança"** (cabeçalho, secções e botão flutuante). WhatsApp e telefone aparecem como alternativas em todas as páginas (botão flutuante e rodapé). Decisão revista em 28/10/2026 para cumprir o checklist SEO.
- Morada removida de rodapé, página de Contacto e dados estruturados (schema.org) — mantém-se apenas o telefone e as cidades atendidas.
- Página inicial: título "Reparação de Eletrodomésticos e Reparação Residencial"; destaque "✓ Garantia de 6 meses em reparação de eletrodomésticos"; técnico com **mais de 10 anos de experiência**.
- Rodapé (todas as páginas): faixa "Seja um técnico na Confiança Manutenção" com botão "Registar como técnico".
- Preços:
  - Visita/diagnóstico de eletrodomésticos (lavagem, cozinha, refrigeração, secagem, reparação de termoacumulador e esquentador) = **55€**
  - Instalação de Termoacumulador (até 100 L) = **80€** (preço fixo)
  - Instalação de Esquentador e Manutenção Preventiva = a partir de **45€**
  - Vistoria para Seguradora, Orçamento para Remodelação e Assistência Técnica para Empresas = sob consulta

## Pendências antes de publicar

- **Domínio**: `siteUrl` em `config.js` está como placeholder (`confiancareparacoes.pt`) — atualizar quando o domínio definitivo for escolhido.
- **Avaliações do Google**: a secção de avaliações foi removida da home. Voltar a publicá-la só com avaliações reais e visíveis; não marcar nota agregada própria no schema.
- **Textos sobre eletricidade na página inicial**: "Problemas Mais Comuns" (tomadas, disjuntor, candeeiros) e "Sobre Nós" ("pequenas avarias elétricas") ainda referem a Elétrica Geral, que está desativada.
- **Preços a confirmar**: Instalação de Esquentador (45€). Os serviços desativados também têm preços provisórios (45€).
- **Link de técnicos**: `technicianSignupUrl` aponta para a mesma página de login dos clientes (`/auth`) — trocar se existir uma página própria de registo de técnicos.
- **Instalação de esquentador a gás**: em Portugal, a ligação ao gás exige técnico de gás credenciado; a página atual só refere a ligação à água.
- **Parcerias (Worten, Fixo, Oscar, etc.)**: não incluí os nomes dos parceiros empresariais no site público — eles aparecem no currículo institucional, mas publicar nomes de parceiros/clientes num site indexado pelo Google é diferente de usá-los num documento privado. Avisa-me se quiseres incluí-los.
- **Logótipo no rodapé**: quase invisível sobre o fundo azul-escuro — usar uma versão branca do logótipo, se existir.
- **Hospedagem**: este é um site estático — pode ser publicado em qualquer hospedagem simples (Hostinger, Vercel, Netlify, etc.) apontando para esta pasta (sem a pasta `_build`).


## Versão SEO v2 (28/10/2026)

**O que mudou**

- Canonical, sitemap e robots são gerados pelo `generate.js` a partir de `config.siteUrl`.
- Página 404 com `noindex`, política de privacidade (`politica-de-privacidade.html`) e link no rodapé.
- Open Graph, Twitter Cards, favicon, apple-touch-icon e manifest.
- Schema `Offer` com preço nos serviços que têm preço fixo ou "a partir de".
- Tailwind compilado para `assets/tailwind.css`, sem CDN.
- Banner de cookies e GA4 só carregam após consentimento, e só se `config.ga4Id` estiver preenchido.

**Como gerar**

1. `cd _build && node generate.js`
2. Compilar o CSS (só quando mudar classes de Tailwind): `npx -y tailwindcss@3.4.17 -c tailwind.config.js -i tailwind.input.css -o ../assets/tailwind.css --minify`

**Antes de publicar (dados que faltam)**

- `config.siteUrl`: domínio definitivo. Canonical, sitemap e Open Graph dependem dele.
- `config.ga4Id`: ID do GA4 (G-XXXXXXX). Vazio = sem medição.
- `politica-de-privacidade.html`: substituir os campos entre [colchetes] (responsável, NIF, e-mail, data e prazo de conservação). Revisão jurídica recomendada.
- Perfil de Empresa no Google: criar ou reivindicar e ligar ao site.
- Fotos reais de trabalhos e da equipa, em `images/`, com alt descritivo.
- Avaliações reais do Google, só quando forem publicadas no site como texto.
- Comprovar ou remover: "Garantia de 6 meses" e "mais de 10 anos de experiência".
- Hospedagem com HTTPS e redirecionamento de `www` para o domínio escolhido.
