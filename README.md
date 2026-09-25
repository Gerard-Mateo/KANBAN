# KANBAN

Un tablero Kanban para llevar mis tareas y mi productividad, hecho a mi manera.
Nació porque ninguna herramienta hacía exactamente lo que yo quería: seleccionar
muchas tareas a la vez y trabajar con ellas en bloque, sin pelearme con la interfaz.

## Qué hace

**Tablero**

- Tres columnas: Por Hacer, En Progreso y Hecho, con arrastrar y soltar.
- Selección múltiple de verdad: clic para una, Ctrl/Cmd+clic para sumar, y
  arrastrar un recuadro sobre las tarjetas (como en el explorador de archivos).
  Al llegar al borde de la pantalla el scroll sigue solo.
- Las tareas seleccionadas se mueven **todas juntas**, tanto entre columnas como
  reordenando dentro de una, y viajan apiladas mientras las arrastras.
- Acciones en grupo con clic derecho: renombrar en bloque (reemplazar una palabra,
  o añadir texto al inicio o al final), clonar, cambiar tipo y estado de varias
  tareas a la vez, o borrarlas.
- Clic derecho en una columna para crear una tarea, o varias de golpe: escribes el
  texto común una vez y una línea por tarea.
- Búsqueda al vuelo (escribe en cualquier parte del tablero) y filtros por tipo.
  Al filtrar, la barra de progreso cuenta solo lo filtrado.

**Tipos de tarea**

- Video, Guion, Módulo y General vienen incluidos; algunos se detectan solos por
  el título.
- Puedes crear tus propios tipos con su color, cambiarles el color después y
  borrarlos.

**Pomodoro**

- Temporizador con reloj tipo flip, presets, sonido y notificaciones.
- Al empezar una sesión la tarea pasa a En Progreso, y al terminar puedes marcarla
  como hecha. Guarda historial de pomodoros por tarea.

**OKRs**

- Objetivos con key results en formato SMART, progreso y tareas enlazadas al tablero.

**Guardar y exportar**

- Guardado automático en la nube (Supabase).
- Botón Guardar (o Ctrl+G) para escribir una versión en una carpeta local que
  eliges una vez; cada guardado es un archivo nuevo con fecha y hora.
- Exportar a Excel o CSV, incluido el historial de movimientos, e importar de vuelta.

## Desarrollo

Necesitas Node.js y npm.

```sh
git clone https://github.com/Gerard-Mateo/KANBAN.git
cd KANBAN
npm install
npm run dev
```

La app queda en http://localhost:8080.

Variables de entorno (`.env`):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

Otros comandos:

```sh
npm run build    # build de producción
npm run lint     # eslint
npm run format   # prettier
```

## Stack

TanStack Start · React · TypeScript · Tailwind CSS · dnd-kit · Supabase · xlsx
