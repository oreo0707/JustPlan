"use client";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
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
import { useEffect, useRef, useState } from "react";
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
  pageHeight?: number;
};

type ToolbarSelectionStyle = {
  color: string;
  fontFamily: string;
  fontSize: string;
};

const MIXED_STYLE_VALUE = "__mixed__";

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
  pageHeight = 1123,
}: RichNoteEditorProps) {
  const [fallbackColor, setFallbackColor] = useState(sharedColor);
  const [toolbarSelectionStyle, setToolbarSelectionStyle] =
    useState<ToolbarSelectionStyle>({
      color: sharedColor,
      fontFamily: defaultFontFamily,
      fontSize: `${defaultFontSize}px`,
    });
  const [highlightColor, setHighlightColor] = useState("#fef08a");
  const lastPickerTextColorRef = useRef<{
    color: string;
    from: number;
    to: number;
    appliedAt: number;
  } | null>(null);
  const activeColor = toolbarSelectionStyle.color ?? sharedColor ?? fallbackColor;
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
    setToolbarSelectionStyle((current) => ({ ...current, color }));
    onSharedColorChange?.(color);
  }

  function getSelectionTextStyle(editorInstance: Editor) {
    const colors = new Set<string>();
    const fontFamilies = new Set<string>();
    const fontSizes = new Set<string>();
    const defaultColor = sharedColor ?? fallbackColor;
    const defaultSize = `${defaultFontSize}px`;

    function addTextStyle(attrs: Record<string, unknown>) {
      colors.add(
        typeof attrs.color === "string" && attrs.color
          ? attrs.color
          : defaultColor
      );
      fontFamilies.add(
        typeof attrs.fontFamily === "string" && attrs.fontFamily
          ? attrs.fontFamily
          : defaultFontFamily
      );
      fontSizes.add(
        typeof attrs.fontSize === "string" && attrs.fontSize
          ? attrs.fontSize
          : defaultSize
      );
    }

    const { from, to, empty } = editorInstance.state.selection;

    if (empty) {
      addTextStyle(editorInstance.getAttributes("textStyle"));
    } else {
      editorInstance.state.doc.nodesBetween(from, to, (node) => {
        if (!node.isText || node.textContent.length === 0) return;

        const textStyleMark = node.marks.find(
          (mark) => mark.type.name === "textStyle"
        );
        addTextStyle(textStyleMark?.attrs ?? {});
      });
    }

    if (colors.size === 0) colors.add(defaultColor);
    if (fontFamilies.size === 0) fontFamilies.add(defaultFontFamily);
    if (fontSizes.size === 0) fontSizes.add(defaultSize);

    return {
      color: Array.from(colors)[0] ?? defaultColor,
      fontFamily:
        fontFamilies.size === 1
          ? Array.from(fontFamilies)[0]
          : MIXED_STYLE_VALUE,
      fontSize:
        fontSizes.size === 1 ? Array.from(fontSizes)[0] : MIXED_STYLE_VALUE,
    };
  }

  function refreshToolbarSelectionStyle(editorInstance: Editor) {
    const nextStyle = getSelectionTextStyle(editorInstance);

    setToolbarSelectionStyle((current) =>
      current.color === nextStyle.color &&
      current.fontFamily === nextStyle.fontFamily &&
      current.fontSize === nextStyle.fontSize
        ? current
        : nextStyle
    );
  }

  function applySharedTextColor(color: string, eventTime: number) {
    updateSharedColor(color);
    if (!editor) return;

    const { from, to, empty } = editor.state.selection;
    editor.chain().focus().setColor(color).run();
    setToolbarSelectionStyle((current) => ({ ...current, color }));
    lastPickerTextColorRef.current = empty
      ? null
      : { color, from, to, appliedAt: eventTime };
  }

  function applySharedHighlight(eventTime: number) {
    const { from, to, empty } = activeEditor.state.selection;
    const lastPickerTextColor = lastPickerTextColorRef.current;
    const shouldUndoPickerTextColor =
      !empty &&
      lastPickerTextColor?.color === highlightColor &&
      lastPickerTextColor.from === from &&
      lastPickerTextColor.to === to &&
      eventTime - lastPickerTextColor.appliedAt < 8000;

    if (shouldUndoPickerTextColor) {
      activeEditor
        .chain()
        .focus()
        .unsetColor()
        .toggleHighlight({ color: highlightColor })
        .run();
      lastPickerTextColorRef.current = null;
      return;
    }

    activeEditor.chain().focus().toggleHighlight({ color: highlightColor }).run();
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
      refreshToolbarSelectionStyle(editor);
    },
    editorProps: {
      attributes: {
        class:
          `min-h-[calc(100vh-260px)] w-full bg-transparent p-0 ${editorTextClass} outline-none leading-[32px] [&_p]:m-0 [&_p]:min-h-8 [&_p]:py-0 [&_p]:leading-[32px] [&_li]:min-h-8 [&_li]:py-0 [&_li]:leading-[32px] [&_span]:align-baseline [&_span]:leading-none [&_mark]:align-baseline [&_mark]:leading-none [&_strong]:leading-none [&_u]:leading-none`,
        style: `font-family: ${defaultFontFamily}; font-size: ${defaultFontSize}px;`,
      },
      handleKeyDown: (_view, event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key === "Enter"
        ) {
          event.preventDefault();

          const lineHeight = 32;
          const selectionEnd = _view.state.selection.to;
          const editorBounds = _view.dom.getBoundingClientRect();
          let caretY = 0;

          try {
            caretY = _view.coordsAtPos(selectionEnd).top - editorBounds.top;
          } catch {
            caretY = _view.dom.scrollHeight;
          }

          const nextPageTop =
            (Math.floor(Math.max(0, caretY) / pageHeight) + 1) * pageHeight;
          const linesToInsert = Math.max(
            1,
            Math.ceil((nextPageTop - caretY + 1) / lineHeight)
          );
          const blankParagraphs = Array.from({ length: linesToInsert }, () => ({
            type: "paragraph",
          }));

          editor?.chain().focus().insertContent(blankParagraphs).run();
          return true;
        }

        return false;
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

  useEffect(() => {
    if (!editor) return;

    const refresh = () => refreshToolbarSelectionStyle(editor);

    refresh();
    editor.on("selectionUpdate", refresh);
    editor.on("transaction", refresh);
    editor.on("focus", refresh);

    return () => {
      editor.off("selectionUpdate", refresh);
      editor.off("transaction", refresh);
      editor.off("focus", refresh);
    };
  });

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
        onClick={(event) => applySharedHighlight(event.timeStamp)}
      >
        Highlight
      </button>

      <input
        type="color"
        title="Highlight colour"
        value={highlightColor}
        onChange={(event) => setHighlightColor(event.target.value)}
        className={
          isDark
            ? "h-8 w-10 rounded border border-slate-600 bg-slate-800"
            : "h-8 w-10 rounded border"
        }
      />

      {toolbarControls}

      <select
        className={toolbarSelectClass}
        value={toolbarSelectionStyle.fontFamily}
        onChange={(event) => {
          if (event.target.value === MIXED_STYLE_VALUE) return;
          activeEditor
            .chain()
            .focus()
            .setFontFamily(event.target.value)
            .run();
          setToolbarSelectionStyle((current) => ({
            ...current,
            fontFamily: event.target.value,
          }));
        }}
      >
        <option value={MIXED_STYLE_VALUE} disabled>
          -
        </option>
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
        value={toolbarSelectionStyle.fontSize}
        onChange={(event) => {
          if (event.target.value === MIXED_STYLE_VALUE) return;
          activeEditor.chain().focus().setFontSize(event.target.value).run();
          setToolbarSelectionStyle((current) => ({
            ...current,
            fontSize: event.target.value,
          }));
        }}
      >
        <option value={MIXED_STYLE_VALUE} disabled>
          -
        </option>
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
        onChange={(event) =>
          applySharedTextColor(event.target.value, event.timeStamp)
        }
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
