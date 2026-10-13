-- Definiciones anteriores de cada tarea al redefinirla: [{ title, type?, at, reason? }].
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS redefinitions jsonb NOT NULL DEFAULT '[]'::jsonb;
