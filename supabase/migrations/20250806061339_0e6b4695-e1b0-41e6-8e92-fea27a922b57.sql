-- Fix the remaining security issues

-- 1. Fix the audit function by removing SECURITY DEFINER and making it simpler
DROP FUNCTION IF EXISTS public.audit_trigger();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp';