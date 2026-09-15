CREATE TABLE public.objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  period text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objectives TO authenticated;
GRANT ALL ON public.objectives TO service_role;
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can manage objectives" ON public.objectives FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.key_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  specific text NOT NULL DEFAULT '',
  measurable text NOT NULL DEFAULT '',
  achievable text NOT NULL DEFAULT '',
  relevant text NOT NULL DEFAULT '',
  time_bound text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  start_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  target_value numeric NOT NULL DEFAULT 100,
  due_date date,
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.key_results TO authenticated;
GRANT ALL ON public.key_results TO service_role;
ALTER TABLE public.key_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can manage key results" ON public.key_results FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.key_result_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_result_id uuid NOT NULL REFERENCES public.key_results(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  board_task_title text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.key_result_tasks TO authenticated;
GRANT ALL ON public.key_result_tasks TO service_role;
ALTER TABLE public.key_result_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can manage key result tasks" ON public.key_result_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_key_results_objective ON public.key_results(objective_id);
CREATE INDEX idx_key_result_tasks_kr ON public.key_result_tasks(key_result_id);

CREATE TRIGGER update_objectives_updated_at BEFORE UPDATE ON public.objectives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_key_results_updated_at BEFORE UPDATE ON public.key_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_key_result_tasks_updated_at BEFORE UPDATE ON public.key_result_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();