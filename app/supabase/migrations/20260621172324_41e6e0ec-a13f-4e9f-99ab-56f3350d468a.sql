REVOKE ALL ON FUNCTION public.resolve_service_payout_amount(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_payout_on_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_payout_amount(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_payout_amount(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_payout_on_rating() TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_payout_amount(text, text) TO service_role;