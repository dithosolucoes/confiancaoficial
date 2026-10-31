-- 1. Add 'tecnicos' to payable_category enum
ALTER TYPE public.payable_category ADD VALUE IF NOT EXISTS 'tecnicos';