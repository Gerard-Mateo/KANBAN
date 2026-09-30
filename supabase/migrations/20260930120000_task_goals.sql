-- Meta medible opcional por tarea ("3 de 10 blogs").
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS goal_target integer;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS goal_current integer NOT NULL DEFAULT 0;
