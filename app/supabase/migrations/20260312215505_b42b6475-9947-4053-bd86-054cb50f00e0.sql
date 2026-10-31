
-- Add email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text DEFAULT '';

-- Update handle_new_user to also store email
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, user_type, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer') = 'gestor'
           AND NEW.email NOT IN ('confiancaversatilidade@gmail.com', 'ifoundlx.adm@gmail.com')
      THEN 'customer'
      ELSE COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer')
    END,
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$function$;

-- Backfill existing profiles with email from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.user_id = u.id AND (p.email IS NULL OR p.email = '');
