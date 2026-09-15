import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { AuthGate } from "@/components/kanban/AuthGate";
import { PomodoroPage } from "@/components/pomodoro/PomodoroPage";

export const Route = createFileRoute("/pomodoro")({
  validateSearch: (search: Record<string, unknown>): { task?: string } =>
    typeof search["task"] === "string" ? { task: search["task"] } : {},
  head: () => ({
    meta: [
      { title: "Pomodoro — Enfoque por tarea" },
      {
        name: "description",
        content:
          "Corre sesiones Pomodoro sobre tus tareas del tablero, con duración configurable y conteo de pomodoros por tarea.",
      },
      { property: "og:title", content: "Pomodoro — Enfoque por tarea" },
      {
        property: "og:description",
        content: "Temporizador Pomodoro conectado a tu tablero Kanban, con historial por tarea.",
      },
    ],
  }),
  component: PomodoroRoute,
});

function PomodoroRoute() {
  return (
    <main className="min-h-screen">
      <ClientOnly fallback={<div className="min-h-screen" />}>
        <AuthGate>{(session) => <PomodoroPage userId={session.user.id} />}</AuthGate>
      </ClientOnly>
    </main>
  );
}
