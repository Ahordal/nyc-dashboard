// PanelInfoModal.tsx
//
// Centred, full-detail information modal for dashboard panels whose info
// content is too long for PanelHeader's small anchored popup. Renders
// over the whole dashboard rather than anchored to the panel.

import {
  useEffect,
  useId,
  useRef,
} from "react";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

type PanelInfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export default function PanelInfoModal({
  isOpen,
  onClose,
  title,
  children,
}: PanelInfoModalProps) {
  const titleId = useId();

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // Focus the close button on open, restore focus to the trigger on
  // close, and lock body scrolling while the modal is up.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Close button only renders with a title; fall back to the dialog itself.
    (closeButtonRef.current ?? dialogRef.current)?.focus();

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  // Close on Escape, and keep Tab focus cycling inside the dialog.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );

      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="info-modal-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="info-modal"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={title ? titleId : undefined}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        {title && (
          <div className="info-modal-header">
            <span
              id={titleId}
              className="info-modal-title"
            >
              {title}
            </span>

            <button
              ref={closeButtonRef}
              type="button"
              className="info-modal-close-button"
              onClick={onClose}
              aria-label="Close"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}

        <div 
          className="info-modal-content"
          style={!title ? { paddingTop: "1rem" } : undefined}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}