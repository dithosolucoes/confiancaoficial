-- Add technician-specific profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS surname text DEFAULT '',
  ADD COLUMN IF NOT EXISTS iban text DEFAULT '',
  ADD COLUMN IF NOT EXISTS emergency_contact text DEFAULT '';