-- O papel company_admin (empresa parceira) é usado pelo app e pelas políticas,
-- mas a regra de tipos de perfil nunca foi atualizada para aceitá-lo.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_type_check
  CHECK (user_type IN ('customer', 'technician', 'gestor', 'company_admin'));
