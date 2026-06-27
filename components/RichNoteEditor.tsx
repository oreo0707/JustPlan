"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
} from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type RichNoteEditorProps = {
  content: string;
  onChange: (content: string) => void;
  minimumHeight?: string;
  defaultFontFamily?: string;
  defaultFontSize?: number;
  theme?: "light" | "dark";
  sharedColor?: string;
  onSharedColorChange?: (color: string) => void;
  toolbarControls?: ReactNode;
  onContentHeightChange?: (height: number) => void;
};

export const NOTE_FONT_FAMILIES = [
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Comic Sans MS",
];

export const NOTE_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];

export function RichNoteEditor({
  content,
  onChange,
  minimumHeight,
  defaultFontFamily = "Arial",
  defaultFontSize = 16,
  theme = "light",
  sharedColor = "#111827",
  onSharedColorChange,
  toolbarControls,
  onContentHeightChange,
}: RichNoteEditorProps) {
  const [fallbackColor, setFallbackColor] = useState(sharedColor);
  const activeColor = sharedColor ?? fallbackColor;
  const editorTextClass =
    theme === "dark" ? "text-[#f8fafc] caret-[#f8fafc]" : "text-[#111827]";
  const isDark = theme === "dark";
  const toolbarClass = isDark
    ? "no-print fixed left-[48%] top-4 z-[10000] flex w-max max-w-none -translate-x-1/2 flex-nowrap items-center gap-2 overflow-visible rounded-xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-slate-100 shadow-lg backdrop-blur [&>*]:shrink-0"
    : "no-print fixed left-[48%] top-4 z-[10000] flex w-max max-w-none -translate-x-1/2 flex-nowrap items-center gap-2 overflow-visible rounded-xl border bg-white/95 px-4 py-3 shadow-lg backdrop-blur [&>*]:shrink-0";
  const toolbarButtonClass = isDark
    ? "rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-slate-100 hover:bg-slate-700"
    : "rounded-lg border px-3 py-1 text-sm";
  const toolbarSelectClass = isDark
    ? "rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-slate-100"
    : "rounded-lg border px-3 py-1 text-sm";

  function updateSharedColor(color: string) {
    setFallbackColor(color);
    onSharedColorChange?.(color);
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Image,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          `min-h-[calc(100vh-260px)] w-full bg-transparent p-0 ${editorTextClass} outline-none leading-[32px] [&_p]:m-0 [&_p]:min-h-8 [&_p]:py-0 [&_p]:leading-[32px] [&_li]:min-h-8 [&_li]:py-0 [&_li]:leading-[32px] [&_span]:align-baseline [&_span]:leading-none [&_mark]:align-baseline [&_mark]:leading-none [&_strong]:leading-none [&_u]:leading-none`,
        style: `font-family: ${defaultFontFamily}; font-size: ${defaultFontSize}px;`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;

    const editorElement = editor.view.dom;

    function reportHeight() {
      onContentHeightChange?.(editorElement.scrollHeight);
    }

    reportHeight();

    const resizeObserver = new ResizeObserver(reportHeight);
    resizeObserver.observe(editorElement);

    return () => resizeObserver.disconnect();
  }, [editor, onContentHeightChange]);

  if (!editor) {
    return (
      <div
        className={
          isDark
            ? "rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-300"
            : "rounded-xl border bg-white p-4 text-sm text-gray-500"
        }
      >
        Loading editor...
      </div>
    );
  }

  const activeEditor = editor;
  const toolbar = (
    <div className={toolbarClass}>
      <button
        type="button"
        className={`${toolbarButtonClass} font-bold`}
        onClick={() => activeEditor.chain().focus().toggleBold().run()}
      >
        B
      </button>

      <button
        type="button"
        className={`${toolbarButtonClass} underline`}
        onClick={() => activeEditor.chain().focus().toggleUnderline().run()}
      >
        U
      </button>

      <button
        type="button"
        className={toolbarButtonClass}
        onClick={() =>
          activeEditor
            .chain()
            .focus()
            .toggleHighlight({ color: activeColor })
            .run()
        }
      >
        Highlight
      </button>

      {toolbarControls}

      <select
        className={toolbarSelectClass}
        defaultValue=""
        onChange={(event) =>
          activeEditor
            .chain()
            .focus()
            .setFontFamily(event.target.value)
            .run()
        }
      >
        <option value="" disabled>
          Font
        </option>
        {NOTE_FONT_FAMILIES.map((fontFamily) => (
          <option key={fontFamily} value={fontFamily}>
            {fontFamily}
          </option>
        ))}
      </select>

      <select
        className={toolbarSelectClass}
        defaultValue=""
        onChange={(event) =>
          activeEditor.chain().focus().setFontSize(event.target.value).run()
        }
      >
        <option value="" disabled>
          Size
        </option>
        {NOTE_FONT_SIZES.map((fontSize) => (
          <option key={fontSize} value={`${fontSize}px`}>
            {fontSize}
          </option>
        ))}
      </select>

      <input
        type="color"
        title="Colour"
        value={activeColor}
        onChange={(event) => updateSharedColor(event.target.value)}
        className={
          isDark
            ? "h-8 w-10 rounded border border-slate-600 bg-slate-800"
            : "h-8 w-10 rounded border"
        }
      />
    </div>
  );

  return (
    <div className="min-h-full overflow-visible">
      {typeof document === "undefined"
        ? toolbar
        : createPortal(toolbar, document.body)}

      <div
        className="note-editor-surface overflow-visible"
        style={{ minHeight: minimumHeight }}
      >
        <EditorContent editor={activeEditor} />
      </div>
    </div>
  );
}
