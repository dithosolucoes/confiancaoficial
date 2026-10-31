-- Drop the old check constraint and add one that includes 'gestor'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_type_check CHECK (user_type IN ('customer', 'technician', 'gestor'));