import type { NoteTemplate } from "@/lib/types";

type PaperBackgroundProps = {
  template: NoteTemplate;
  children: React.ReactNode;
  minimumHeight?: string;
  pageCount?: number;
  pageHeight?: number;
  theme?: "light" | "dark";
};

export function PaperBackground({
  template,
  children,
  minimumHeight,
  pageCount = 1,
  pageHeight = 960,
  theme = "light",
}: PaperBackgroundProps) {
  const isDark = theme === "dark";
  const pageBackgroundClass = isDark
    ? {
        plain: "border-slate-700 bg-[#111827]",
        lined:
          "border-slate-700 bg-[#111827] [background-image:linear-gradient(#374151_1px,transparent_1px)] [background-position:0_6px] [background-size:100%_32px]",
        grid:
          "border-slate-700 bg-[#111827] [background-image:linear-gradient(#374151_1px,transparent_1px),linear-gradient(90deg,#374151_1px,transparent_1px)] [background-position:0_6px] [background-size:32px_32px]",
        dots:
          "border-slate-700 bg-[#111827] [background-image:radial-gradient(#4b5563_1px,transparent_1px)] [background-size:20px_20px]",
      }[template]
    : {
        plain: "border-gray-200 bg-[#ffffff]",
        lined:
          "border-gray-200 bg-[#ffffff] [background-image:linear-gradient(#e5e7eb_1px,transparent_1px)] [background-position:0_6px] [background-size:100%_32px]",
        grid:
          "border-gray-200 bg-[#ffffff] [background-image:linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] [background-position:0_6px] [background-size:32px_32px]",
        dots:
          "border-gray-200 bg-[#ffffff] [background-image:radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:20px_20px]",
      }[template];

  return (
    <div
      className="relative"
      style={{ minHeight: minimumHeight }}
    >
      {Array.from({ length: pageCount }, (_, index) => (
        <div
          key={index}
          className={`print-note-page pointer-events-none absolute inset-x-0 rounded-xl border shadow-sm ${pageBackgroundClass}`}
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
