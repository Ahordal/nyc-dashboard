// PaginationBar.tsx
//
// Reusable pagination controls for navigating large lists.

import { useEffect, useRef } from "react";

type PaginationBarProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  itemName?: string; // Optional prop to customize the label (e.g., "restaurants", "reports")
};

export default function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  itemName = "restaurants",
}: PaginationBarProps) {
  const prevButtonRef = useRef<HTMLButtonElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);
  // Set when the user pages via one of the buttons while it holds focus.
  // If that button then disables itself at an end, the browser would drop
  // focus to <body>; the effect below hands it to the sibling instead.
  const restoreFocusRef = useRef<"prev" | "next" | null>(null);

  useEffect(() => {
    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;

    if (target === "next" && nextButtonRef.current?.disabled) {
      prevButtonRef.current?.focus();
    } else if (target === "prev" && prevButtonRef.current?.disabled) {
      nextButtonRef.current?.focus();
    }
  }, [currentPage]);

  // If there's nothing to paginate, render nothing.
  if (totalItems === 0) return null;

  function handlePrev() {
    if (document.activeElement === prevButtonRef.current) {
      restoreFocusRef.current = "prev";
    }
    onPageChange(Math.max(1, currentPage - 1));
  }

  function handleNext() {
    if (document.activeElement === nextButtonRef.current) {
      restoreFocusRef.current = "next";
    }
    onPageChange(Math.min(totalPages, currentPage + 1));
  }

  return (
    <div className="restaurant-list-pagination">
      <button
        ref={prevButtonRef}
        type="button"
        onClick={handlePrev}
        disabled={currentPage === 1}>
        Previous
      </button>
      <span className="pagination-text">
        Page <span className="pagination-num">{currentPage}</span> of{" "}
        <span className="pagination-num">{totalPages.toLocaleString()}</span>{" "}
        <span className="pagination-count">
          (<span className="pagination-num">{totalItems.toLocaleString()}</span>{" "}
          {itemName})
        </span>
      </span>
      <button
        ref={nextButtonRef}
        type="button"
        onClick={handleNext}
        disabled={currentPage === totalPages}>
        Next
      </button>
    </div>
  );
}
