"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  AppData,
  Note,
  NoteObject,
  NoteTemplate,
  Subject,
} from "@/lib/types";
import { defaultData } from "@/lib/default-data";
import { loadData, saveData } from "@/lib/storage";
import {
  updateNoteContent,
  updateNoteObjects,
  updateNoteTemplate,
} from "@/lib/study-actions";
import { PaperBackground } from "@/components/PaperBackground";
import { RichNoteEditor } from "@/components/RichNoteEditor";
import { NoteObjectLayer } from "@/components/NoteObjectLayer";
import { storeImageDataUrl } from "@/lib/image-storage";

export default function NoteEditorPage() {
  const params = useParams<{
    subjectId: string;
    noteId: string;
  }>();

  const subjectId = params.subjectId;
  const noteId = params.noteId;

  const [data, setData] = useState<AppData>(defaultData);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [template, setTemplate] = useState<NoteTemplate>("plain");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [objects, setObjects] = useState<NoteObject[]>([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [isObjectSelectionMode, setIsObjectSelectionMode] = useState(false);
  const [shapeColor, setShapeColor] = useState("#111827");
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const stickerPickerRef = useRef<HTMLDivElement | null>(null);

  const [cursorStyle, setCursorStyle] = useState<
    "default" | "y2k-arrow" | "heart" | "cute-pointer" | "star"
  >("default");

  useEffect(() => {
    const loadedData = loadData();
    setData(loadedData);

    const foundSubject = loadedData.subjects.find(
      (item) => item.id === subjectId
    );

    const foundNote = foundSubject?.notes.find(
      (item) => item.id === noteId
    );

    setSubject(foundSubject ?? null);
    setNote(foundNote ?? null);
    setContent(foundNote?.content ?? "");
    setTemplate(foundNote?.template ?? "plain");
    setObjects(foundNote?.objects ?? []);
    setCursorStyle(loadedData.settings.cursor_style);
    setHasLoaded(true);
  }, [subjectId, noteId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!showStickerPicker) return;

      const target = event.target as Node;

      if (
        stickerPickerRef.current &&
        !stickerPickerRef.current.contains(target)
      ) {
        setShowStickerPicker(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showStickerPicker]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    saveData(data);

    const updatedSubject = data.subjects.find(
      (item) => item.id === subjectId
    );

    const updatedNote = updatedSubject?.notes.find(
      (item) => item.id === noteId
    );

    setSubject(updatedSubject ?? null);
    setNote(updatedNote ?? null);
  }, [data, hasLoaded, subjectId, noteId]);

  function handleSaveNote() {
    const updatedData = updateNoteContent(
      data,
      subjectId,
      noteId,
      content
    );

    setData(updatedData);
  }
  

  function handleChangeTemplate(newTemplate: NoteTemplate) {
  setTemplate(newTemplate);

  const updatedData = updateNoteTemplate(
    data,
    subjectId,
    noteId,
    newTemplate
  );

  setData(updatedData);
  }
  

  function handleChangeObjects(newObjects: NoteObject[]) {
    setObjects(newObjects);

    const updatedData = updateNoteObjects(
      data,
      subjectId,
      noteId,
      newObjects
    );

    setData(updatedData);
  }

  function addSticker(src: string) {
    const newSticker: NoteObject = {
      id: crypto.randomUUID(),
      type: "sticker",
      src,
      x: 80,
      y: 120,
      width: 120,
      height: 120,
      originalWidth: 120,
      originalHeight: 120,
      flipX: false,
      flipY: false,
    };

    handleChangeObjects([...objects, newSticker]);
  }

  async function addImageObject(src: string, width: number, height: number) {
    let storedSrc: string;

    try {
      storedSrc = await storeImageDataUrl(src);
    } catch {
      window.alert("The image could not be saved in browser storage.");
      return;
    }

    const newImage: NoteObject = {
      id: crypto.randomUUID(),
      type: "image",
      src: storedSrc,
      x: 100,
      y: 140,
      width,
      height,
      originalWidth: width,
      originalHeight: height,
      flipX: false,
      flipY: false,
    };

    handleChangeObjects([...objects, newImage]);
    setSelectedObjectIds([newImage.id]);
  }

  function addShape(
    type: "rectangle" | "circle" | "triangle" | "line"
  ) {
    const newShape: NoteObject = {
      id: crypto.randomUUID(),
      type,
      x: 100,
      y: 140,
      width: type === "line" ? 180 : type === "triangle" ? 120 : 140,
      height: type === "line" ? 0 : type === "triangle" ? 100 : 90,
      endX: type === "line" ? 280 : undefined,
      endY: type === "line" ? 140 : undefined,
      color: shapeColor,
      filled: false,
      flipX: false,
      flipY: false,
    };

    handleChangeObjects([...objects, newShape]);
  }

  function snapToLineGrid(value: number) {
  return Math.round(value / 32) * 32;
}

function addTextBox() {
  const newTextBox: NoteObject = {
    id: crypto.randomUUID(),
    type: "textbox",
    x: 100,
    y: snapToLineGrid(128),
    width: 260,
    height: 128,
    text: "",
    color: "#111827",
    fontSize: data.settings.default_font_size,
    fontFamily: data.settings.default_font_family,
    flipX: false,
    flipY: false,
  };

  handleChangeObjects([...objects, newTextBox]);
  setSelectedObjectIds([newTextBox.id]);
}

  function updateSelectedObject(updates: Partial<NoteObject>) {
    if (selectedObjectIds.length !== 1) return;

    const selectedObjectId = selectedObjectIds[0];

    handleChangeObjects(
      objects.map((object) =>
        object.id === selectedObjectId ? { ...object, ...updates } : object
      )
    );
  }

  const selectedObject =
    selectedObjectIds.length === 1
      ? objects.find((object) => object.id === selectedObjectIds[0])
      : undefined;

  const objectExtents = objects.reduce(
    (extents, object) => {
      if (object.type === "line") {
        const startX = object.x;
        const startY =
          object.endX !== undefined && object.endY !== undefined
            ? object.y
            : object.y + object.height;
        const endX = object.endX ?? object.x + object.width;
        const endY = object.endY ?? object.y;

        return {
          right: Math.max(extents.right, startX, endX),
          bottom: Math.max(extents.bottom, startY, endY),
        };
      }

      return {
        right: Math.max(extents.right, object.x + object.width),
        bottom: Math.max(extents.bottom, object.y + object.height),
      };
    },
    { right: 0, bottom: 0 }
  );
  const canvasMinimumHeight = `max(calc(100vh - 260px), ${Math.ceil(
    objectExtents.bottom + 120
  )}px)`;
  const canvasWidth = `max(100%, ${Math.ceil(objectExtents.right + 120)}px)`;

  const stickerOptions = [
    {
      label: "Cat Meme 1",
      category: "Cats Meme",
      src: "/stickers/cat_meme/apple-cat.gif",
    },
    {
      label: "Cat Meme 2",
      category: "Cats Meme",
      src: "/stickers/cat_meme/banana-cat.gif",
    },
    {
      label: "Cat Meme 3",
      category: "Cats Meme",
      src: "/stickers/cat_meme/cat-meme (3).gif",
    },
    {
      label: "Cat Meme 4",
      category: "Cats Meme",
      src: "/stickers/cat_meme/chipi-chipi-cat.gif",
    },
    {
      label: "Cat Meme 5",
      category: "Cats Meme",
      src: "/stickers/cat_meme/cute-cats-memes.gif",
    },
    {
      label: "Cat Meme 6",
      category: "Cats Meme",
      src: "/stickers/cat_meme/cute-staring-cat.gif",
    },
    {
      label: "Cat Meme 7",
      category: "Cats Meme",
      src: "/stickers/cat_meme/dancing-cat.gif",
    },
    {
      label: "Cat Meme 8",
      category: "Cats Meme",
      src: "/stickers/cat_meme/dancing-cat-by-self.gif",
    },
    {
      label: "Cat Meme 9",
      category: "Cats Meme",
      src: "/stickers/cat_meme/good-job.gif",
    },
    {
      label: "Cat Meme 10",
      category: "Cats Meme",
      src: "/stickers/cat_meme/i-do-not-know.gif",
    },
    {
      label: "Cat Meme 11",
      category: "Cats Meme",
      src: "/stickers/cat_meme/kitty-cat.gif",
    },
    {
      label: "Cat Meme 12",
      category: "Cats Meme",
      src: "/stickers/cat_meme/pop-cat.gif",
    },
    {
      label: "Cat Meme 13",
      category: "Cats Meme",
      src: "/stickers/cat_meme/wet-cat.gif",
    },
        {
      label: "Cat Meme 14",
      category: "Cats Meme",
      src: "/stickers/cat_meme/ahhhh.jpg",
    },
    {
      label: "Cat Meme 15",
      category: "Cats Meme",
      src: "/stickers/cat_meme/angry-cat-barbara.jpg",
    },
    {
      label: "Cat Meme 16",
      category: "Cats Meme",
      src: "/stickers/cat_meme/a-working-cat.jpg",
    },
    {
      label: "Cat Meme 17",
      category: "Cats Meme",
      src: "/stickers/cat_meme/black-cat-filing-nails.jpg",
    },
    {
      label: "Cat Meme 18",
      category: "Cats Meme",
      src: "/stickers/cat_meme/black-thinking-cat.jpg",
    },
    {
      label: "Cat Meme 19",
      category: "Cats Meme",
      src: "/stickers/cat_meme/cat-face.jpg",
    },
    {
      label: "Cat Meme 20",
      category: "Cats Meme",
      src: "/stickers/cat_meme/cat-face-3.jpg",
    },
    {
      label: "Cat Meme 21",
      category: "Cats Meme",
      src: "/stickers/cat_meme/cat-laughing-with-finger.jpg",
    },
    {
      label: "Cat Meme 22",
      category: "Cats Meme",
      src: "/stickers/cat_meme/open-the-door-2.jpg",
    },
    {
      label: "Cat Meme 23",
      category: "Cats Meme",
      src: "/stickers/cat_meme/strange-knowledge-increased.jpg",
    },
    {
      label: "Cat Meme 24",
      category: "Cats Meme",
      src: "/stickers/cat_meme/thinking.jpg",
    },
    {
      label: "Cat Meme 25",
      category: "Cats Meme",
      src: "/stickers/cat_meme/what-did-u-say.jpg",
    },
    {
      label: "Cat Meme 26",
      category: "Cats Meme",
      src: "/stickers/cat_meme/white-crying-cat.jpg",
    },
    {
      label: "Cat Meme 27",
      category: "Cats Meme",
      src: "/stickers/cat_meme/yes-i-can.jpg",
    },
    {
      label: "Cute Frame 1",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/1.png",
    },
    {
      label: "Cute Frame 2",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/2.png",
    },
    {
      label: "Cute Frame 3",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/3.png",
    },
    {
      label: "Cute Frame 4",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/4.png",
    },
    {
      label: "Cute Frame 5",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/5.png",
    },
    {
      label: "Cute Frame 6",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/6.png",
    },
    {
      label: "Cute Frame 7",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/7.png",
    },
    {
      label: "Cute Frame 8",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/8.png",
    },
    {
      label: "Cute Frame 9",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/9.png",
    },
    {
      label: "Cute Frame 10",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/10.png",
    },
    {
      label: "Cute Frame 11",
      category: "Doodle Frames",
      src: "/stickers/cute-frames/11.png",
    },
    {
      label: "Jellycat 1",
      category: "Jellycat",
      src: "/stickers/jc/1.png",
    },
    {
      label: "Jellycat 2",
      category: "Jellycat",
      src: "/stickers/jc/2.png",
    },
    {
      label: "Jellycat 3",
      category: "Jellycat",
      src: "/stickers/jc/3.png",
    },
    {
      label: "Jellycat 4",
      category: "Jellycat",
      src: "/stickers/jc/4.png",
    },
    {
      label: "Jellycat 5",
      category: "Jellycat",
      src: "/stickers/jc/5.png",
    },
    {
      label: "Jellycat 6",
      category: "Jellycat",
      src: "/stickers/jc/6.png",
    },
    {
      label: "Jellycat 7",
      category: "Jellycat",
      src: "/stickers/jc/7.png",
    },
    {
      label: "Jellycat 8",
      category: "Jellycat",
      src: "/stickers/jc/8.png",
    },
    {
      label: "Jellycat 9",
      category: "Jellycat",
      src: "/stickers/jc/9.png",
    },
    {
      label: "Jellycat 10",
      category: "Jellycat",
      src: "/stickers/jc/10.png",
    },
    {
      label: "Jellycat 11",
      category: "Jellycat",
      src: "/stickers/jc/11.png",
    },
    {
      label: "Jellycat 12",
      category: "Jellycat",
      src: "/stickers/jc/12.png",
    },
    {
      label: "Jellycat 13",
      category: "Jellycat",
      src: "/stickers/jc/13.png",
    },
    {
      label: "Jellycat 14",
      category: "Jellycat",
      src: "/stickers/jc/14.png",
    },
    {
      label: "Jellycat 15",
      category: "Jellycat",
      src: "/stickers/jc/15.png",
    },
    {
      label: "Jellycat 16",
      category: "Jellycat",
      src: "/stickers/jc/16.png",
    },
    {
      label: "Jellycat 17",
      category: "Jellycat",
      src: "/stickers/jc/17.png",
    },
    {
      label: "Jellycat 18",
      category: "Jellycat",
      src: "/stickers/jc/18.png",
    },
    {
      label: "Jellycat 19",
      category: "Jellycat",
      src: "/stickers/jc/19.png",
    },
    {
      label: "Jellycat 20",
      category: "Jellycat",
      src: "/stickers/jc/20.png",
    },
    {
      label: "Jellycat 21",
      category: "Jellycat",
      src: "/stickers/jc/21.png",
    },
    {
      label: "Jellycat 22",
      category: "Jellycat",
      src: "/stickers/jc/22.png",
    },
    {
      label: "Jellycat 23",
      category: "Jellycat",
      src: "/stickers/jc/23.png",
    },
    {
      label: "Jellycat 24",
      category: "Jellycat",
      src: "/stickers/jc/24.png",
    },
    {
      label: "Doodle 1",
      category: "Doodles",
      src: "/stickers/doodles/1.png",
    },
    {
      label: "Doodle 2",
      category: "Doodles",
      src: "/stickers/doodles/2.png",
    },
    {
      label: "Doodle 3",
      category: "Doodles",
      src: "/stickers/doodles/3.png",
    },
    {
      label: "Doodle 4",
      category: "Doodles",
      src: "/stickers/doodles/4.png",
    },
  {
      label: "Doodle 5",
      category: "Doodles",
      src: "/stickers/doodles/5.png",
    },
    {
      label: "Doodle 6",
      category: "Doodles",
      src: "/stickers/doodles/6.png",
    },
    {
      label: "Doodle 7",
      category: "Doodles",
      src: "/stickers/doodles/7.png",
    },
    {
      label: "Doodle 8",
      category: "Doodles",
      src: "/stickers/doodles/8.png",
    },
    {
      label: "Doodle 9",
      category: "Doodles",
      src: "/stickers/doodles/9.png",
    },
    {
      label: "Doodle 10",
      category: "Doodles",
      src: "/stickers/doodles/10.png",
    },
    {
      label: "Doodle 11",
      category: "Doodles",
      src: "/stickers/doodles/11.png",
    },
    {
      label: "Doodle 12",
      category: "Doodles",
      src: "/stickers/doodles/12.png",
    },
  {
      label: "Doodle 13",
      category: "Doodles",
      src: "/stickers/doodles/13.png",
    },
    {
      label: "Doodle 14",
      category: "Doodles",
      src: "/stickers/doodles/14.png",
    },
    {
      label: "Doodle 15",
      category: "Doodles",
      src: "/stickers/doodles/15.png",
    },
    {
      label: "Doodle 16",
      category: "Doodles",
      src: "/stickers/doodles/16.png",
    },
    {
      label: "Doodle 17",
      category: "Doodles",
      src: "/stickers/doodles/17.png",
    },
    {
      label: "Doodle 18",
      category: "Doodles",
      src: "/stickers/doodles/18.png",
    },
  ];

  const cursorClass =
    cursorStyle === "default" ? "" : `cursor-${cursorStyle}`;
  if (!subject || !note) {
    return (
      <main className={`flex h-screen flex-col overflow-hidden bg-gray-50 ${cursorClass}`}>
        <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
          <Link href="/" className="text-sm text-blue-600">
            ← Back to Home
          </Link>

          <h1 className="mt-6 text-xl font-bold text-gray-950">
            Note not found
          </h1>

          <p className="mt-2 text-gray-500">
            This note or subject may have been deleted.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-auto bg-gray-50">
      <header className="sticky top-0 z-50 flex items-center justify-between border-b bg-white px-6 py-4">
        <div>
          <Link
            href={`/subjects/${subjectId}`}
            className="text-sm font-medium text-blue-600"
          >
            ← Back to {subject.name}
          </Link>

          <h1 className="mt-1 text-2xl font-bold text-gray-950">
            {note.title}
          </h1>

          <p className="text-sm text-gray-500">
            {subject.name}
          </p>
        </div>

        <button
          className="rounded-lg bg-black px-4 py-2 text-white"
          onClick={handleSaveNote}
        >
          Save Note
        </button>
      </header>

      <section className="flex min-h-[calc(100vh-89px)] flex-col p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">
              Template
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              {(["plain", "lined", "grid", "dots"] as NoteTemplate[]).map(
                (item) => (
                  <button
                    key={item}
                    className={
                      template === item
                        ? "rounded-lg bg-black px-3 py-2 text-sm capitalize text-white"
                        : "rounded-lg border bg-white px-3 py-2 text-sm capitalize text-gray-700"
                    }
                    onClick={() => handleChangeTemplate(item)}
                  >
                    {item}
                  </button>
                )
              )}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm">
              <button
                type="button"
                className={
                  isObjectSelectionMode
                    ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
                    : "rounded-lg border px-3 py-1 text-sm"
                }
                onClick={() => {
                  setIsObjectSelectionMode((current) => !current);
                  setSelectedObjectIds([]);
                }}
              >
                {isObjectSelectionMode ? "Done Selecting" : "Select Objects"}
              </button>

              <button
                type="button"
                className="rounded-lg border px-3 py-1 text-sm"
                onClick={addTextBox}
              >
                Text Box
              </button>
              <div className="relative" ref={stickerPickerRef}>
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1 text-sm"
                  onClick={() => setShowStickerPicker((current) => !current)}
                >
                  Stickers
                </button>

                {showStickerPicker && (
                  <div className="absolute left-0 top-10 z-50 w-80 rounded-xl border bg-white p-3 shadow-lg">
                    <p className="mb-2 text-sm font-semibold text-gray-800">
                      Choose a sticker
                    </p>

                    <div className="grid max-h-64 grid-cols-3 gap-3 overflow-y-auto">
                      {stickerOptions.map((sticker) => (
                        <button
                          key={sticker.src}
                          type="button"
                          className="rounded-lg border bg-gray-50 p-2 text-left hover:bg-gray-100"
                          onClick={() => {
                            addSticker(sticker.src);
                            setShowStickerPicker(false);
                          }}
                        >
                          <img
                            src={sticker.src}
                            alt={sticker.label}
                            className="mx-auto h-16 w-16 object-contain"
                          />

                          <p className="mt-1 truncate text-xs font-medium text-gray-800">
                            {sticker.label}
                          </p>

                          <p className="truncate text-[10px] text-gray-500">
                            {sticker.category}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <select
                className="rounded-lg border px-3 py-1 text-sm"
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value as
                    | "rectangle"
                    | "circle"
                    | "triangle"
                    | "line";

                  if (!value) return;

                  addShape(value);
                  event.target.value = "";
                }}
              >
                <option value="" disabled>
                  Add Shape
                </option>
                <option value="rectangle">▭ Rectangle</option>
                <option value="circle">○ Circle</option>
                <option value="triangle">△ Triangle</option>
                <option value="line">╱ Line</option>
              </select>

              <input
                type="color"
                value={shapeColor}
                onChange={(event) => setShapeColor(event.target.value)}
                className="h-8 w-10 rounded border"
                title="Shape colour"
              />

              {selectedObject && (
                <>
                  {selectedObject.type !== "textbox" &&
                    selectedObject.type !== "line" && (
                    <>
                      <button
                        className="rounded-lg border px-3 py-1 text-sm"
                        onClick={() =>
                          updateSelectedObject({
                            flipX: !selectedObject.flipX,
                          })
                        }
                      >
                        Flip X
                      </button>

                      <button
                        className="rounded-lg border px-3 py-1 text-sm"
                        onClick={() =>
                          updateSelectedObject({
                            flipY: !selectedObject.flipY,
                          })
                        }
                      >
                        Flip Y
                      </button>
                    </>
                  )}

                  {selectedObject.type !== "sticker" &&
                    selectedObject.type !== "image" && (
                    <button
                      className="rounded-lg border px-3 py-1 text-sm"
                      onClick={() =>
                        updateSelectedObject({
                          color: shapeColor,
                        })
                      }
                    >
                      Apply Colour
                    </button>
                  )}

                  {selectedObject.type !== "sticker" &&
                    selectedObject.type !== "image" &&
                    selectedObject.type !== "line" &&
                    selectedObject.type !== "textbox" && (
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1 text-sm"
                      onClick={() =>
                        updateSelectedObject({
                          filled: !selectedObject.filled,
                        })
                      }
                    >
                      {selectedObject.filled ? "Unfill Shape" : "Fill Shape"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div
          className="relative"
          style={{ minHeight: canvasMinimumHeight, width: canvasWidth }}
          onPointerDown={() => {
            if (!isObjectSelectionMode) {
              setSelectedObjectIds([]);
            }
          }}
        >
          <PaperBackground
            template={template}
            minimumHeight={canvasMinimumHeight}
          >
            <RichNoteEditor
              content={content}
              onChange={setContent}
              onAddImage={addImageObject}
              minimumHeight={canvasMinimumHeight}
              defaultFontFamily={data.settings.default_font_family}
              defaultFontSize={data.settings.default_font_size}
            />
          </PaperBackground>

          <NoteObjectLayer
            objects={objects}
            selectedObjectIds={selectedObjectIds}
            onSelectionChange={setSelectedObjectIds}
            onChangeObjects={handleChangeObjects}
            selectionMode={isObjectSelectionMode}
          />
        </div>
      </section>
    </main>
  );
}
