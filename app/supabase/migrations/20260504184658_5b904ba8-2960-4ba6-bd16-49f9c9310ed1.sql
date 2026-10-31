GRANT EXECUTE ON FUNCTION public.is_gestor(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_technician(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_partner_member(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_user_ids(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids(uuid) TO anon, authenticated;