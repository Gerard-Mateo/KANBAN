-- Esquema local equivalente a supabase/migrations (tareas y pomodoros).
-- Docker lo ejecuta solo la primera vez que crea el volumen.
-- Sin Docker: mysql -u root -p kanban < mysql/init/01-schema.sql
CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  column_id ENUM('todo','doing','done') NOT NULL,
  position INT NOT NULL DEFAULT 0,
  type VARCHAR(64) NULL,
  history JSON NOT NULL,
  goal_target INT NULL,
  goal_current INT NOT NULL DEFAULT 0,
  planned_days JSON NULL,
  redefinitions JSON NULL,
  day_order JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX tasks_user_column_idx (user_id, column_id, position)
);

-- Espacio personal de cada cuenta: pendientes, regalos y apariencia (un JSON).
CREATE TABLE IF NOT EXISTS personal_spaces (
  user_id VARCHAR(64) NOT NULL PRIMARY KEY,
  data JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL DEFAULT 'local',
  task_title TEXT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 25,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  task_done BOOLEAN NOT NULL DEFAULT FALSE,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX pomodoro_sessions_user_idx (user_id, started_at)
);
