import type {
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type FilterButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  active?: boolean;
};

export default function FilterButton({
  children,
  active = false,
  className = "",
  ...props
}: FilterButtonProps) {
  return (
    <button
      className={`filter-button ${active ? "active" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}