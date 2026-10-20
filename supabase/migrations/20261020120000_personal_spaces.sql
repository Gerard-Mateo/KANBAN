-- Espacio personal de cada cuenta (pendientes, regalos y apariencia). A
-- diferencia del tablero, solo lo ve y lo cambia su dueño.
CREATE TABLE IF NOT EXISTS public.personal_spaces (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Each user reads their personal space" ON public.personal_spaces
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Each user creates their personal space" ON public.personal_spaces
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Each user updates their personal space" ON public.personal_spaces
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Each user deletes their personal space" ON public.personal_spaces
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
