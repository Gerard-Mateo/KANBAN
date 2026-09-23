import { useRef } from "react";

/**
 * Handlers for a modal's backdrop div: closes on a real click on the backdrop
 * itself, but not when the press started inside the dialog (e.g. dragging to
 * select text) and the drag happens to end outside the dialog's bounds --
 * `click` still fires on the backdrop in that case since that's where the
 * mouse came up, even though the user never meant to click the backdrop.
 * Spread the result onto the backdrop div; no stopPropagation needed on the
 * inner panel, since `target` is checked directly rather than relying on
 * bubbling being blocked.
 */
export function useBackdropClose(onClose: () => void) {
  const downOnBackdrop = useRef(false);

  return {
    onMouseDown: (e: React.MouseEvent) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onClose();
      downOnBackdrop.current = false;
    },
  };
}
