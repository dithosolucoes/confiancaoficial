
-- Update the handle_new_user trigger to enforce gestor restriction
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, user_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer') = 'gestor'
           AND NEW.email != 'confiancaversatilidade@gmail.com'
      THEN 'customer'
      ELSE COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer')
    END
  );
  RETURN NEW;
END;
$function$;
