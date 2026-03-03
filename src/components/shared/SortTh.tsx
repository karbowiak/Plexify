interface SortThProps {
  col: string
  label: string
  active: string
  dir: "asc" | "desc"
  onSort: (col: string) => void
  align: "left" | "right"
}

export function SortTh({ col, label, active, dir, onSort, align }: SortThProps) {
  const isActive = active === col
  return (
    <th
      className={`p-2 text-${align} cursor-pointer select-none whitespace-nowrap transition-colors hover:text-white ${isActive ? "text-white" : ""}`}
      onClick={() => onSort(col)}
    >
      {label}
      {isActive && (
        <span className="ml-1 text-accent">{dir === "asc" ? "↑" : "↓"}</span>
      )}
    </th>
  )
}
