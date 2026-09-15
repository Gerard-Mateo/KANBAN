CREATE TABLE public.pomodoro_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_title text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 25,
  completed boolean NOT NULL DEFAULT false,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  ended_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pomodoro_sessions TO authenticated;
GRANT ALL ON public.pomodoro_sessions TO service_role;

ALTER TABLE public.pomodoro_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own pomodoro sessions"
ON public.pomodoro_sessions FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX pomodoro_sessions_user_idx ON public.pomodoro_sessions (user_id, started_at DESC);

CREATE TRIGGER update_pomodoro_sessions_updated_at
BEFORE UPDATE ON public.pomodoro_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();