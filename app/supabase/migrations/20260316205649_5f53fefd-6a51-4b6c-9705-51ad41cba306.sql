
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS address text DEFAULT '' ,
ADD COLUMN IF NOT EXISTS billing_name text DEFAULT '' ,
ADD COLUMN IF NOT EXISTS billing_nif text DEFAULT '' ,
ADD COLUMN IF NOT EXISTS billing_address text DEFAULT '' ;
