DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.connamespace = 'public'::regnamespace
      AND c.confrelid = 'auth.users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

INSERT INTO public.workspaces (id, owner_id, name, description)
VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000000', 'CIEL', 'Default workspace')
ON CONFLICT (id) DO NOTHING;