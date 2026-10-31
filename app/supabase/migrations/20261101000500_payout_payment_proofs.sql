-- Pagamento de repasse feito por fora do sistema (transferência, Pix, dinheiro),
-- com referência e comprovante anexado pelo gestor.
-- Quem paga e quem vê o comprovante: só o gestor.

ALTER TABLE public.technician_payout_batches
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_proof_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payout-proofs', 'payout-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Gestores manage payout proofs" ON storage.objects;
CREATE POLICY "Gestores manage payout proofs"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'payout-proofs' AND public.is_gestor(auth.uid()))
  WITH CHECK (bucket_id = 'payout-proofs' AND public.is_gestor(auth.uid()));
