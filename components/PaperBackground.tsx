import type { NoteTemplate } from "@/lib/types";

type PaperBackgroundProps = {
  template: NoteTemplate;
  children: React.ReactNode;
  minimumHeight?: string;
};

export function PaperBackground({
  template,
  children,
  minimumHeight,
}: PaperBackgroundProps) {
  const backgroundClass = {
    plain: "bg-white",
    lined:
      "bg-white [&_.note-editor-surface]:[background-image:linear-gradient(#e5e7eb_1px,transparent_1px)] [&_.note-editor-surface]:[background-position:0_6px] [&_.note-editor-surface]:[background-size:100%_32px]",
    grid:
      "bg-white [&_.note-editor-surface]:[background-image:linear-gradient(#e5e7eb_1px,transparent_1px),linear-gradient(90deg,#e5e7eb_1px,transparent_1px)] [&_.note-editor-surface]:[background-position:0_6px] [&_.note-editor-surface]:[background-size:32px_32px]",
    dots:
      "bg-white [&_.note-editor-surface]:[background-image:radial-gradient(#d1d5db_1px,transparent_1px)] [&_.note-editor-surface]:[background-size:20px_20px]",
  }[template];

  return (
    <div
      className={`min-h-full rounded-xl border p-4 shadow-sm ${backgroundClass}`}
      style={{ minHeight: minimumHeight }}
    >
      {children}
    </div>
  );
}
