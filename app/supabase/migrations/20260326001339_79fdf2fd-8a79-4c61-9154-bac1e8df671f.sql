ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS postal_code text DEFAULT '' ,
  ADD COLUMN IF NOT EXISTS localidade text DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_complement text DEFAULT '';