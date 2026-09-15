import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Board } from "@/components/kanban/Board";
import { AuthGate } from "@/components/kanban/AuthGate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tablero Kanban — Mis Tareas" },
      {
        name: "description",
        content:
          "Tablero Kanban con arrastrar y soltar para organizar guiones, videos y proyectos entre Por Hacer, En Progreso y Hecho.",
      },
      { property: "og:title", content: "Tablero Kanban — Mis Tareas" },
      {
        property: "og:description",
        content: "Organiza tus tareas arrastrando tarjetas entre columnas, con guardado automático.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen">
      <ClientOnly fallback={<div className="min-h-screen" />}>
        <AuthGate>
          {(session) => <Board userId={session.user.id} email={session.user.email} />}
        </AuthGate>
      </ClientOnly>
    </main>
  );
}
