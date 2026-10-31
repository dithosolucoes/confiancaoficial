# Confiança Repara

Plataforma de gestão de assistência técnica de eletrodomésticos em Portugal.
Liga clientes, técnicos da Confiança e empresas parceiras, com agendamento, orçamentos, peças, repasses e financeiro.

## Perfis

- **Cliente:** abre chamados, acompanha o estado e aprova orçamentos.
- **Técnico:** agenda do dia, atualização de estado, orçamentos de peças e conclusão com laudo.
- **Empresa parceira (company_admin):** recebe chamados despachados, cadastra a própria equipa e acompanha repasses.
- **Gestor Master:** configura catálogo, regras de divisão, despacho, financeiro e auditoria.

## Stack

- React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui
- React Router, TanStack Query, react-i18next (pt, en, es)
- Supabase (Postgres com RLS, Auth, Edge Functions)
- Vitest para testes unitários

## Desenvolvimento local

Requisitos: Node.js 20+, Docker (para o Supabase local) e Supabase CLI.

```sh
npm install
npx supabase start
npx supabase migration up
npm run dev
```

- App: http://localhost:3000
- Studio do Supabase: http://127.0.0.1:54323
- Caixa de e-mails local (Mailpit): http://127.0.0.1:54424

Variáveis de ambiente: copie `.env.example` para `.env.local` e preencha.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários (Vitest) |

## Migrações

Todas as alterações de banco ficam em `supabase/migrations`, em ordem de data. Antes de publicar, aplique todas as migrações pendentes no projeto Supabase de produção (`npx supabase db push`).

## Estrutura

- `src/modules/admin`, `src/modules/company`: portais do gestor e da empresa parceira
- `src/components`: componentes compartilhados e painéis
- `src/lib`: regras de negócio puras (financeiro, IVA, tipos de serviço, status)
- `src/hooks`: autenticação e notificações
- `supabase/functions`: Edge Functions
