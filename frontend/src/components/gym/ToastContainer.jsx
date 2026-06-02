import { memo } from "react";
import { createPortal } from "react-dom";
import { TrainingToast } from "./TrainingToast";

/**
 * Fixed-position toast stack, portalled to document.body so it sits above the
 * app layout regardless of where it's rendered in the tree.
 *
 * The container is pointer-events:none (so it never blocks clicks behind it);
 * each toast re-enables pointer-events for its own close button.
 */
export const ToastContainer = memo(function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return createPortal(
    <div className="toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <TrainingToast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
});
