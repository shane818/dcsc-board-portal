-- Add ex_officio value to committee_role enum
ALTER TYPE public.committee_role ADD VALUE IF NOT EXISTS 'ex_officio';
