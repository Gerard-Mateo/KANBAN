-- Puesto de la tarea dentro de cada día del calendario: { "2026-10-14": 0, ... }.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS day_order jsonb NOT NULL DEFAULT '{}'::jsonb;
