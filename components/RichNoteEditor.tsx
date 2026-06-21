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
import { useState } from "react";

type RichNoteEditorProps = {
  content: string;
  onChange: (content: string) => void;
  onAddImage?: (src: string, width: number, height: number) => void;
  minimumHeight?: string;
  defaultFontFamily?: string;
  defaultFontSize?: number;
};

export function RichNoteEditor({
  content,
  onChange,
  onAddImage,
  minimumHeight,
  defaultFontFamily = "Arial",
  defaultFontSize = 16,
}: RichNoteEditorProps) {
  const [highlightColor, setHighlightColor] = useState("#fef08a");

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
          "min-h-[calc(100vh-260px)] w-full bg-transparent p-4 text-gray-950 outline-none leading-[32px] [&_p]:m-0 [&_p]:min-h-8 [&_p]:leading-[32px] [&_li]:min-h-8 [&_li]:leading-[32px] [&_span]:align-baseline [&_span]:leading-none",
        style: `font-family: ${defaultFontFamily}; font-size: ${defaultFontSize}px;`,
      },
    },
  });

  if (!editor) {
    return (
      <div className="rounded-xl border bg-white p-4 text-sm text-gray-500">
        Loading editor...
      </div>
    );
  }

  const activeEditor = editor;

  function addImageFromDevice(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const src = reader.result;

      if (typeof src === "string") {
        if (onAddImage) {
          const imageElement = new window.Image();

          imageElement.onload = () => {
            const scale = Math.min(
              320 / imageElement.naturalWidth,
              240 / imageElement.naturalHeight,
              1
            );

            onAddImage(
              src,
              imageElement.naturalWidth * scale,
              imageElement.naturalHeight * scale
            );
          };
          imageElement.onerror = () => onAddImage(src, 320, 200);
          imageElement.src = src;
          return;
        }

        activeEditor.chain().focus().setImage({ src }).run();
      }
    };

    reader.readAsDataURL(file);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-3 flex flex-wrap gap-2 rounded-xl border bg-white p-3 shadow-sm">
        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm font-bold"
          onClick={() => activeEditor.chain().focus().toggleBold().run()}
        >
          B
        </button>

        <button
          type="button"
          className="rounded-lg border px-3 py-1 text-sm underline"
          onClick={() => activeEditor.chain().focus().toggleUnderline().run()}
        >
          U
        </button>

        <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
          <button
            type="button"
            className="text-sm"
            onClick={() =>
              activeEditor
                .chain()
                .focus()
                .toggleHighlight({ color: highlightColor })
                .run()
            }
          >
            Highlight
          </button>

          <input
            type="color"
            title="Highlight colour"
            value={highlightColor}
            onChange={(event) => setHighlightColor(event.target.value)}
            className="h-6 w-7 border-0 bg-transparent p-0"
          />
        </div>

        <select
          className="rounded-lg border px-3 py-1 text-sm"
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
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Comic Sans MS">Comic Sans</option>
        </select>

        <select
          className="rounded-lg border px-3 py-1 text-sm"
          defaultValue=""
          onChange={(event) =>
            activeEditor.chain().focus().setFontSize(event.target.value).run()
          }
        >
          <option value="" disabled>
            Size
          </option>
          <option value="12px">12</option>
          <option value="14px">14</option>
          <option value="16px">16</option>
          <option value="18px">18</option>
          <option value="20px">20</option>
          <option value="24px">24</option>
        </select>

        <input
          type="color"
          title="Font color"
          className="h-8 w-10 rounded border"
          onChange={(event) =>
            activeEditor.chain().focus().setColor(event.target.value).run()
          }
        />

        <label className="cursor-pointer rounded-lg border px-3 py-1 text-sm">
          Image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                addImageFromDevice(file);
              }

              event.target.value = "";
            }}
          />
        </label>
      </div>

      <div
        className="note-editor-surface flex-1"
        style={{ minHeight: minimumHeight }}
      >
        <EditorContent editor={activeEditor} />
      </div>
    </div>
  );
}
