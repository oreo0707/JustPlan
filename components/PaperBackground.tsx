import type { NoteTemplate } from "@/lib/types";

type PaperBackgroundProps = {
  template: NoteTemplate;
  children: React.ReactNode;
  minimumHeight?: string;
  pageCount?: number;
  pageHeight?: number;
};

export function PaperBackground({
  template,
  children,
  minimumHeight,
  pageCount = 1,
  pageHeight = 960,
}: PaperBackgroundProps) {
  const pageBackgroundClass = {
    plain: "bg-white",
    lined:
      "bg-white [background-image:linear-gradient(#e5e7eb_1px,transparent_1px)] [background-position:0_48px] [background-size:100%_32px]",
    grid:
      "bg-white [background-image:linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] [background-position:0_48px] [background-size:32px_32px]",
    dots:
      "bg-white [background-image:radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:20px_20px]",
  }[template];

  return (
    <div
      className="relative"
      style={{ minHeight: minimumHeight }}
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <div
          key={index}
          className={`pointer-events-none absolute inset-x-0 rounded-xl border shadow-sm ${pageBackgroundClass}`}
          style={{
            top: index * pageHeight,
            height: pageHeight,
          }}
        />
      ))}

      <div className="relative z-10 p-4">
      {children}
      </div>
    </div>
  );
}
