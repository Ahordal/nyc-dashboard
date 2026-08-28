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

  // Focus the close button on open, and lock body scrolling while the
  // modal is up.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  // Close on Escape while open.
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
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
        className="info-modal"
        role="dialog"
        aria-modal="true"
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