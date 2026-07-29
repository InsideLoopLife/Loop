-- v27.85.1 SQL hotfix: function argument-name compatibility
-- Supabase/Postgres does not allow CREATE OR REPLACE FUNCTION to rename an
-- existing input parameter. This drops and recreates the two helper functions,
-- then you can run the corrected v27_85 migration if needed.

DROP FUNCTION IF EXISTS public.loop_try_numeric(text);
DROP FUNCTION IF EXISTS public.loop_try_timestamptz(text);

CREATE OR REPLACE FUNCTION public.loop_try_numeric(p_value text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN regexp_replace(p_value, '[^0-9\.\-]', '', 'g')::numeric;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.loop_try_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
