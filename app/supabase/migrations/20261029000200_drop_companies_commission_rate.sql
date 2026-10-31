-- O repasse é definido pela regra em src/lib/financial-rules.ts (TECH_SHARE e data de corte),
-- não por empresa. A coluna não era lida por nenhum código.
ALTER TABLE public.companies DROP COLUMN IF EXISTS commission_rate;
