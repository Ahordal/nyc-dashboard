// PanelHeader.tsx
//
// Reusable panel header component. Displays the panel title and an optional 
// info button that triggers an auto-positioning, portal-rendered tooltip.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type {
  CSSProperties,
  ReactNode,
} from "react";

import { createPortal } from "react-dom";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

type InfoPlacement = "up" | "down" | "auto";
type ResolvedPlacement = "up" | "down";

type PanelHeaderProps = {
  title?: string;
  infoContent?: ReactNode;
  infoPlacement?: InfoPlacement;
};

const POPUP_MAX_WIDTH = 450;
const POPUP_GAP = 8;
const VIEWPORT_PADDING = 8;
const INFO_POPUP_Z_INDEX = 10000;

const HIDDEN_POPUP_STYLE: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  right: "auto",
  bottom: "auto",
  width: POPUP_MAX_WIDTH,
  maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
  boxSizing: "border-box",
  visibility: "hidden",
  zIndex: INFO_POPUP_Z_INDEX,
};

export default function PanelHeader({
  title,
  infoContent,
  infoPlacement = "down",
}: PanelHeaderProps) {
  const popupId = useId();

  const [showInfo, setShowInfo] = useState(false);
  const [resolvedPlacement, setResolvedPlacement] =
    useState<ResolvedPlacement>("down");
  const [popupStyle, setPopupStyle] =
    useState<CSSProperties>(HIDDEN_POPUP_STYLE);

  const headerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Position and clamp the portal popup relative to the button and viewport before paint
  useLayoutEffect(() => {
    if (
      !showInfo ||
      !buttonRef.current ||
      !popupRef.current
    ) {
      return;
    }

    const button = buttonRef.current;
    const popup = popupRef.current;

    function updatePosition() {
      const triggerRect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const availableWidth = Math.max(
        viewportWidth - VIEWPORT_PADDING * 2,
        0,
      );
      const availableHeight = Math.max(
        viewportHeight - VIEWPORT_PADDING * 2,
        0,
      );
      const popupWidth = Math.min(
        POPUP_MAX_WIDTH,
        availableWidth,
      );

      // Pre-set constraints to accurately measure text-wrapped height
      popup.style.width = `${popupWidth}px`;
      popup.style.maxHeight = `${availableHeight}px`;
      popup.style.overflowY = "auto";
      popup.style.boxSizing = "border-box";

      const popupHeight = popup.getBoundingClientRect().height;

      const spaceAbove =
        triggerRect.top -
        POPUP_GAP -
        VIEWPORT_PADDING;

      const spaceBelow =
        viewportHeight -
        triggerRect.bottom -
        POPUP_GAP -
        VIEWPORT_PADDING;

      let nextPlacement: ResolvedPlacement;

      if (infoPlacement === "up") {
        nextPlacement = "up";
      } else if (infoPlacement === "down") {
        nextPlacement = "down";
      } else if (popupHeight <= spaceBelow) {
        nextPlacement = "down";
      } else if (popupHeight <= spaceAbove) {
        nextPlacement = "up";
      } else {
        nextPlacement =
          spaceAbove > spaceBelow
            ? "up"
            : "down";
      }

      const preferredTop =
        nextPlacement === "up"
          ? triggerRect.top - popupHeight - POPUP_GAP
          : triggerRect.bottom + POPUP_GAP;

      const maximumTop = Math.max(
        VIEWPORT_PADDING,
        viewportHeight -
          popupHeight -
          VIEWPORT_PADDING,
      );

      const clampedTop = Math.min(
        Math.max(
          preferredTop,
          VIEWPORT_PADDING,
        ),
        maximumTop,
      );

      // Align popup right edge with the info button
      const preferredLeft =
        triggerRect.right - popupWidth;

      const maximumLeft = Math.max(
        VIEWPORT_PADDING,
        viewportWidth -
          popupWidth -
          VIEWPORT_PADDING,
      );

      const clampedLeft = Math.min(
        Math.max(
          preferredLeft,
          VIEWPORT_PADDING,
        ),
        maximumLeft,
      );

      setResolvedPlacement(nextPlacement);

      setPopupStyle({
        position: "fixed",
        left: clampedLeft,
        top: clampedTop,
        right: "auto",
        bottom: "auto",
        width: popupWidth,
        maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
        maxHeight: `calc(100vh - ${VIEWPORT_PADDING * 2}px)`,
        overflowY: "auto",
        boxSizing: "border-box",
        visibility: "visible",
        zIndex: INFO_POPUP_Z_INDEX,
      });
    }

    updatePosition();

    window.addEventListener(
      "resize",
      updatePosition,
    );
    window.addEventListener(
      "scroll",
      updatePosition,
      true,
    );

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(updatePosition)
        : null;

    resizeObserver?.observe(button);
    resizeObserver?.observe(popup);

    return () => {
      window.removeEventListener(
        "resize",
        updatePosition,
      );
      window.removeEventListener(
        "scroll",
        updatePosition,
        true,
      );
      resizeObserver?.disconnect();
    };
  }, [
    showInfo,
    infoPlacement,
    infoContent,
  ]);

  // Handle outside clicks and Escape key presses
  useEffect(() => {
    if (!showInfo) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        headerRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      ) {
        return;
      }

      setShowInfo(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setShowInfo(false);
      buttonRef.current?.focus();
    }

    document.addEventListener(
      "pointerdown",
      handlePointerDown,
      true,
    );
    document.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true,
      );
      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [showInfo]);

  const popup =
    showInfo &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            id={popupId}
            ref={popupRef}
            className={[
              "panel-header-popup",
              `panel-header-popup-${resolvedPlacement}`,
            ].join(" ")}
            data-placement={resolvedPlacement}
            role="region"
            aria-label={`About ${title ?? "panel"}`}
            style={popupStyle}
          >
            {infoContent}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={headerRef}
        className="panel-header"
      >
        <span className="panel-header-title">
          {title || "\u00A0"}
        </span>

        {infoContent && (
          <button
            ref={buttonRef}
            type="button"
            className="panel-header-info-button"
            onClick={() => {
              if (!showInfo) {
                setPopupStyle(HIDDEN_POPUP_STYLE);
              }

              setShowInfo((currentValue) => !currentValue);
            }}
            aria-label={`About ${title ?? "panel"}`}
            aria-expanded={showInfo}
            aria-controls={
              showInfo
                ? popupId
                : undefined
            }
          >
            <FontAwesomeIcon icon={faCircleInfo} />
          </button>
        )}
      </div>

      {popup}
    </>
  );
}