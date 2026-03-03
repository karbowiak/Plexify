interface ImageModalProps {
  src: string
  alt: string
  onClose: () => void
  overlay?: "dark" | "medium"  // "dark"=black/90 (hero), "medium"=black/80 (art). Default "medium"
}

export function ImageModal({ src, alt, onClose, overlay = "medium" }: ImageModalProps) {
  const isDark = overlay === "dark"
  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm ${isDark ? "bg-black/90" : "bg-black/80"}`}
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt}
        className={isDark
          ? "max-h-[95vh] max-w-[95vw] rounded-lg shadow-2xl object-contain"
          : "max-h-[85vh] max-w-[85vw] rounded-2xl shadow-2xl"}
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}
