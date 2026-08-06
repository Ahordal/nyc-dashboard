// PaginationBar.tsx
// Reusable pagination controls for navigating large datasets.

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
  itemName = "items",
}: PaginationBarProps) {
  // If there's nothing to paginate, render nothing.
  if (totalItems === 0) return null;

  return (
    <div className="restaurant-list-pagination">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}>
        Previous
      </button>
      <span>
        Page {currentPage} of {totalPages.toLocaleString()} (
        {totalItems.toLocaleString()} {itemName} in map view)
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}>
        Next
      </button>
    </div>
  );
}