-- Días del calendario en que se trabajará cada tarea ("AAAA-MM-DD"), seguidos o no.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS planned_days text[] NOT NULL DEFAULT '{}';
