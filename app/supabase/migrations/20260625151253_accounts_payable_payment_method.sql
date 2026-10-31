-- O app grava a forma de pagamento em contas a pagar (MarkAsPaidButton) e o trigger
-- trg_payable_paid_for_batch depende dela. Nenhuma migration anterior criava a coluna.
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS payment_method text;
