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
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<"draw" | "erase">("draw");
  const [shapeColor, setShapeColor] = useState("#111827");
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(4);
  const [eraserStrokeWidth, setEraserStrokeWidth] = useState(18);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDrawMenu, setShowDrawMenu] = useState(false);
  const [showPagePanel, setShowPagePanel] = useState(false);
  const [showNoteMenu, setShowNoteMenu] = useState(false);
  const [textContentHeight, setTextContentHeight] = useState(0);
  const [saveRequestId, setSaveRequestId] = useState(0);
  const [drawingUndoRequestId, setDrawingUndoRequestId] = useState(0);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stickerPickerRef = useRef<HTMLDivElement | null>(null);
  const pendingDrawingCountRef = useRef(0);
  const undoStackRef = useRef<
    Array<{
      content: string;
      objects: NoteObject[];
      template: NoteTemplate;
    }>
  >([]);
  const pageWidth = 794;
  const pageHeight = 1123;

  const [cursorStyle, setCursorStyle] = useState<
    "default" | "y2k-arrow" | "heart" | "cute-pointer" | "star"
  >("default");

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
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
    });

    return () => cancelAnimationFrame(frameId);
  }, [subjectId, noteId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!showStickerPicker) return;
      if (showAddMenu) return;

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
  }, [showAddMenu, showStickerPicker]);

  function toggleExpandedNoteBox(
    target: "note" | "pages" | "add" | "draw"
  ) {
    const isTargetOpen =
      target === "note"
        ? showNoteMenu
        : target === "pages"
          ? showPagePanel
          : target === "add"
            ? showAddMenu
            : showDrawMenu;
    const shouldOpenTarget = !isTargetOpen;

    setShowNoteMenu(shouldOpenTarget && target === "note");
    setShowPagePanel(shouldOpenTarget && target === "pages");
    setShowAddMenu(shouldOpenTarget && target === "add");
    setShowDrawMenu(shouldOpenTarget && target === "draw");

    if (!(shouldOpenTarget && target === "add")) {
      setShowStickerPicker(false);
    }
  }

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    const frameId = requestAnimationFrame(() => {
      saveData(data);

      const updatedSubject = data.subjects.find(
        (item) => item.id === subjectId
      );

      const updatedNote = updatedSubject?.notes.find(
        (item) => item.id === noteId
      );

      setSubject(updatedSubject ?? null);
      setNote(updatedNote ?? null);
    });

    return () => cancelAnimationFrame(frameId);
  }, [data, hasLoaded, subjectId, noteId]);

  function pushUndoSnapshot() {
    const latestSnapshot = undoStackRef.current.at(-1);
    const nextSnapshot = {
      content,
      objects,
      template,
    };

    if (
      latestSnapshot &&
      latestSnapshot.content === nextSnapshot.content &&
      latestSnapshot.template === nextSnapshot.template &&
      JSON.stringify(latestSnapshot.objects) === JSON.stringify(nextSnapshot.objects)
    ) {
      return;
    }

    undoStackRef.current = [...undoStackRef.current.slice(-49), nextSnapshot];
  }

  function applyUndoSnapshot() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return;

    setContent(snapshot.content);
    setObjects(snapshot.objects);
    setTemplate(snapshot.template);

    let updatedData = updateNoteContent(
      data,
      subjectId,
      noteId,
      snapshot.content
    );
    updatedData = updateNoteObjects(
      updatedData,
      subjectId,
      noteId,
      snapshot.objects
    );
    updatedData = updateNoteTemplate(
      updatedData,
      subjectId,
      noteId,
      snapshot.template
    );

    setData(updatedData);
    setSelectedObjectIds([]);
  }

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (!event.ctrlKey || event.key.toLowerCase() !== "z" || isEditableTarget) {
        return;
      }

      event.preventDefault();

      if (pendingDrawingCountRef.current > 0) {
        setDrawingUndoRequestId((current) => current + 1);
        return;
      }

      applyUndoSnapshot();
    }

    window.addEventListener("keydown", handleUndoShortcut);

    return () => window.removeEventListener("keydown", handleUndoShortcut);
  });

  function handleSaveNote() {
    setSaveRequestId((current) => current + 1);

    const updatedData = updateNoteContent(
      data,
      subjectId,
      noteId,
      content
    );

    setData(updatedData);
  }

  function handlePrintNote() {
    setSelectedObjectIds([]);
    setShowNoteMenu(false);
    setShowPagePanel(false);
    setShowAddMenu(false);
    setShowDrawMenu(false);
    setShowStickerPicker(false);
    setIsObjectSelectionMode(false);
    setIsDrawingMode(false);

    setTimeout(() => {
      window.print();
    }, 100);
  }
  

  function handleChangeTemplate(newTemplate: NoteTemplate) {
  pushUndoSnapshot();
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
    pushUndoSnapshot();
    setObjects(newObjects);

    const updatedData = updateNoteObjects(
      data,
      subjectId,
      noteId,
      newObjects
    );

    setData(updatedData);
  }

  function handlePendingDrawingCountChange(count: number) {
    pendingDrawingCountRef.current = count;
  }

  function getCurrentPageIndex() {
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    return Math.max(0, Math.floor(scrollTop / pageHeight));
  }

  function getCenteredObjectPosition(width: number, height: number) {
    const availableWidth = canvasRef.current?.clientWidth ?? pageWidth;
    const pageTop = getCurrentPageIndex() * pageHeight;

    return {
      x: Math.max(40, (availableWidth - width) / 2),
      y: pageTop + Math.max(40, (pageHeight - height) / 2),
    };
  }

  function scrollToPage(pageIndex: number) {
    scrollContainerRef.current?.scrollTo({
      top: pageIndex * pageHeight,
      behavior: "smooth",
    });
  }

  function getSafeFileName(fileName: string) {
    return (
      fileName
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, " ") || "note"
    );
  }

  function waitForRenderedFrame() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
  }

  async function waitForImageElement(image: HTMLImageElement) {
    if (image.decode) {
      await image.decode().catch(() => undefined);
      return;
    }

    if (image.complete) {
      return;
    }

    await new Promise<void>((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
    });
  }

  async function getImageDataUrl(src: string) {
    const response = await fetch(src);
    const blob = await response.blob();

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Could not read image."));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function embedImagesForPdfExport(container: HTMLElement) {
    const images = Array.from(container.querySelectorAll("img"));
    const originalImageSources = images.map((image) => ({
      image,
      src: image.getAttribute("src"),
      srcSet: image.getAttribute("srcset"),
    }));

    await Promise.all(
      images.map(async (image) => {
        const source = image.currentSrc || image.src;

        try {
          if (source && !source.startsWith("data:")) {
            image.removeAttribute("srcset");
            image.src = await getImageDataUrl(source);
          }
        } catch {
          // If an image cannot be embedded, still continue exporting the note.
        }

        await waitForImageElement(image);
      })
    );

    return () => {
      originalImageSources.forEach(({ image, src, srcSet }) => {
        if (src === null) {
          image.removeAttribute("src");
        } else {
          image.setAttribute("src", src);
        }

        if (srcSet === null) {
          image.removeAttribute("srcset");
        } else {
          image.setAttribute("srcset", srcSet);
        }
      });
    };
  }

  async function handleSharePdf() {
    const noteCanvas = canvasRef.current;

    if (!noteCanvas) {
      return;
    }

    setSelectedObjectIds([]);
    setShowNoteMenu(false);
    setShowPagePanel(false);
    setShowAddMenu(false);
    setShowDrawMenu(false);
    setShowStickerPicker(false);
    setIsObjectSelectionMode(false);
    setIsDrawingMode(false);

    await document.fonts?.ready;
    await waitForRenderedFrame();

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "px",
      format: [pageWidth, pageHeight],
      compress: true,
      hotfixes: ["px_scaling"],
    });
    const captureScale = Math.min(window.devicePixelRatio || 2, 2);
    const originalParent = noteCanvas.parentNode;
    const originalNextSibling = noteCanvas.nextSibling;
    const originalStyle = noteCanvas.getAttribute("style");
    const placeholder = document.createComment("note-pdf-export-placeholder");
    const exportFrame = document.createElement("div");

    exportFrame.style.position = "fixed";
    exportFrame.style.left = "0";
    exportFrame.style.top = "0";
    exportFrame.style.zIndex = "-1";
    exportFrame.style.width = `${pageWidth}px`;
    exportFrame.style.height = `${pageHeight}px`;
    exportFrame.style.overflow = "hidden";
    exportFrame.style.background =
      data.settings.theme === "dark" ? "#111827" : "#ffffff";
    exportFrame.style.pointerEvents = "none";

    originalParent?.insertBefore(placeholder, noteCanvas);
    document.body.appendChild(exportFrame);
    exportFrame.appendChild(noteCanvas);

    let restoreExportImages: (() => void) | null = null;

    try {
      restoreExportImages = await embedImagesForPdfExport(exportFrame);
      await waitForRenderedFrame();

      for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        noteCanvas.style.position = "relative";
        noteCanvas.style.left = "0";
        noteCanvas.style.top = "0";
        noteCanvas.style.width = `${pageWidth}px`;
        noteCanvas.style.minHeight = canvasMinimumHeight;
        noteCanvas.style.margin = "0";
        noteCanvas.style.transform = `translateY(-${pageIndex * pageHeight}px)`;
        noteCanvas.style.transformOrigin = "top left";

        await waitForRenderedFrame();

        const pageCanvas = await html2canvas(exportFrame, {
          backgroundColor:
            data.settings.theme === "dark" ? "#111827" : "#ffffff",
          scale: captureScale,
          foreignObjectRendering: true,
          useCORS: true,
          allowTaint: true,
          width: pageWidth,
          height: pageHeight,
          scrollX: 0,
          scrollY: 0,
          windowWidth: pageWidth,
          windowHeight: pageHeight,
        });

        if (pageIndex > 0) {
          pdf.addPage([pageWidth, pageHeight], "portrait");
        }

        pdf.addImage(
          pageCanvas.toDataURL("image/png"),
          "PNG",
          0,
          0,
          pageWidth,
          pageHeight
        );
      }
    } finally {
      restoreExportImages?.();

      if (originalStyle === null) {
        noteCanvas.removeAttribute("style");
      } else {
        noteCanvas.setAttribute("style", originalStyle);
      }

      if (originalParent) {
        originalParent.insertBefore(noteCanvas, originalNextSibling);
      }

      placeholder.remove();
      exportFrame.remove();
    }

    const noteTitle = note?.title ?? "Note";
    const file = new File(
      [pdf.output("blob")],
      `${getSafeFileName(noteTitle)}.pdf`,
      { type: "application/pdf" }
    );

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: noteTitle,
        files: [file],
      });
      return;
    }

    const fileUrl = URL.createObjectURL(file);
    const downloadLink = document.createElement("a");
    downloadLink.href = fileUrl;
    downloadLink.download = file.name;
    downloadLink.click();
    URL.revokeObjectURL(fileUrl);
  }

  function addSticker(src: string) {
    const position = getCenteredObjectPosition(120, 120);
    const newSticker: NoteObject = {
      id: crypto.randomUUID(),
      type: "sticker",
      src,
      x: position.x,
      y: position.y,
      width: 120,
      height: 120,
      originalWidth: 120,
      originalHeight: 120,
      flipX: false,
      flipY: false,
    };

    handleChangeObjects([...objects, newSticker]);
    setSelectedObjectIds([newSticker.id]);
  }

  async function addImageObject(src: string, width: number, height: number) {
    let storedSrc: string;

    try {
      storedSrc = await storeImageDataUrl(src);
    } catch {
      window.alert("The image could not be saved in browser storage.");
      return;
    }

    const position = getCenteredObjectPosition(width, height);
    const newImage: NoteObject = {
      id: crypto.randomUUID(),
      type: "image",
      src: storedSrc,
      x: position.x,
      y: position.y,
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
    const width = type === "line" ? 180 : type === "triangle" ? 120 : 140;
    const height = type === "line" ? 0 : type === "triangle" ? 100 : 90;
    const position = getCenteredObjectPosition(width, Math.max(height, 80));
    const newShape: NoteObject = {
      id: crypto.randomUUID(),
      type,
      x: position.x,
      y: position.y,
      width,
      height,
      endX: type === "line" ? position.x + width : undefined,
      endY: type === "line" ? position.y : undefined,
      color: shapeColor,
      filled: false,
      flipX: false,
      flipY: false,
    };

    handleChangeObjects([...objects, newShape]);
    setSelectedObjectIds([newShape.id]);
  }

  function snapToLineGrid(value: number) {
  return Math.round((value - 16) / 32) * 32 + 16;
}

function addTextBox() {
  const position = getCenteredObjectPosition(260, 128);
  const newTextBox: NoteObject = {
    id: crypto.randomUUID(),
    type: "textbox",
    x: position.x,
    y: snapToLineGrid(position.y),
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
  const contentTextOnly = content
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, "")
    .trim();
  const hasTypedContent = contentTextOnly.length > 0;
  const typedContentBottom = hasTypedContent ? textContentHeight + 32 : 0;
  const usedBottom = Math.max(objectExtents.bottom, typedContentBottom);
  const pageCount =
    usedBottom > 0 ? Math.max(2, Math.ceil(usedBottom / pageHeight) + 1) : 1;
  const canvasPixelHeight = pageCount * pageHeight;
  const canvasMinimumHeight = `${canvasPixelHeight}px`;
  const canvasWidth = `${pageWidth}px`;

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

  const isDarkNoteTheme = data.settings.theme === "dark";
  const noteToolbarButtonClass = isDarkNoteTheme
    ? "rounded-lg border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-slate-100 hover:bg-slate-700"
    : "rounded-lg border px-3 py-1 text-sm";
  const noteToolbarMenuClass = isDarkNoteTheme
    ? "absolute left-0 top-9 z-[10001] w-52 rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-100 shadow-lg"
    : "absolute left-0 top-9 z-[10001] w-52 rounded-xl border bg-white p-2 shadow-lg";
  const noteToolbarMenuItemClass = isDarkNoteTheme
    ? "w-full rounded-lg px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800"
    : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50";
  const noteToolbarSelectClass = isDarkNoteTheme
    ? "mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
    : "mt-1 w-full rounded-lg border px-3 py-2 text-sm";
  const noteStickerGridClass = isDarkNoteTheme
    ? "mt-2 grid max-h-96 w-[28rem] grid-cols-4 gap-3 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-3"
    : "mt-2 grid max-h-96 w-[28rem] grid-cols-4 gap-3 overflow-y-auto rounded-lg border bg-gray-50 p-3";
  const noteStickerButtonClass = isDarkNoteTheme
    ? "rounded-lg border border-slate-700 bg-slate-900 p-1 text-left hover:bg-slate-800"
    : "rounded-lg border bg-white p-1 text-left hover:bg-gray-100";
  const notePageClass = isDarkNoteTheme
    ? "h-screen overflow-auto bg-slate-950 text-slate-100"
    : "h-screen overflow-auto bg-gray-50";
  const noteHeaderClass = isDarkNoteTheme
    ? "no-print flex items-center justify-between border-b border-slate-800 bg-slate-950 px-16 py-3 text-slate-100"
    : "no-print flex items-center justify-between border-b bg-white px-16 py-3";
  const noteTopButtonClass = isDarkNoteTheme
    ? "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
    : "rounded-lg border px-3 py-2 text-sm";
  const noteBackButtonClass = isDarkNoteTheme
    ? "no-print fixed left-4 top-4 z-[60] rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-base leading-none text-slate-100 shadow-sm hover:bg-slate-800"
    : "no-print fixed left-4 top-4 z-[60] rounded-md border bg-white px-2.5 py-1 text-base leading-none shadow-sm";
  const notePanelClass = isDarkNoteTheme
    ? "absolute right-0 top-17 z-50 w-52 rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-lg"
    : "absolute right-0 top-17 z-50 w-52 rounded-xl border bg-white p-3 shadow-lg";
  const noteSidePanelClass = isDarkNoteTheme
    ? "no-print fixed right-4 top-20 z-50 max-h-[calc(100vh-6rem)] w-44 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-lg"
    : "no-print fixed right-4 top-20 z-50 max-h-[calc(100vh-6rem)] w-44 overflow-y-auto rounded-xl border bg-white p-3 shadow-lg";
  const noteSidePageButtonClass = isDarkNoteTheme
    ? "w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-left text-sm text-slate-100 hover:bg-slate-700"
    : "w-full rounded-lg border bg-gray-50 p-2 text-left text-sm hover:bg-gray-100";

  const noteObjectToolbarControls = (
    <>
      <div className="relative">
        <button
          type="button"
          className={
            showAddMenu
              ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
              : noteToolbarButtonClass
          }
          onClick={() => toggleExpandedNoteBox("add")}
        >
          Add
        </button>

        {showAddMenu && (
          <div className={noteToolbarMenuClass}>
            <button
              type="button"
              className={noteToolbarMenuItemClass}
              onClick={() => {
                addTextBox();
                setShowAddMenu(false);
              }}
            >
              Textbox
            </button>

            <label className={`block cursor-pointer ${noteToolbarMenuItemClass}`}>
              Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;

                  const reader = new FileReader();
                  reader.onload = () => {
                    const src = reader.result;
                    if (typeof src !== "string") return;

                    const imageElement = new window.Image();
                    imageElement.onload = () => {
                      const scale = Math.min(
                        320 / imageElement.naturalWidth,
                        240 / imageElement.naturalHeight,
                        1
                      );
                      void addImageObject(
                        src,
                        imageElement.naturalWidth * scale,
                        imageElement.naturalHeight * scale
                      );
                    };
                    imageElement.onerror = () => void addImageObject(src, 320, 200);
                    imageElement.src = src;
                  };
                  reader.readAsDataURL(file);
                  event.target.value = "";
                  setShowAddMenu(false);
                }}
              />
            </label>

            <button
              type="button"
              className={noteToolbarMenuItemClass}
              onClick={() => setShowStickerPicker((current) => !current)}
            >
              Stickers
            </button>

            <select
              className={noteToolbarSelectClass}
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
                setShowAddMenu(false);
              }}
            >
              <option value="" disabled>
                Shape
              </option>
              <option value="rectangle">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="triangle">Triangle</option>
              <option value="line">Line</option>
            </select>

            {showStickerPicker && (
              <div className={noteStickerGridClass}>
                {stickerOptions.map((sticker) => (
                  <button
                    key={sticker.src}
                    type="button"
                    className={noteStickerButtonClass}
                    onClick={() => {
                      addSticker(sticker.src);
                      setShowStickerPicker(false);
                      setShowAddMenu(false);
                    }}
                  >
                    <img
                      src={sticker.src}
                      alt={sticker.label}
                      className="mx-auto h-20 w-20 object-contain"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className={
            isDrawingMode
              ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
              : noteToolbarButtonClass
          }
          onClick={() => toggleExpandedNoteBox("draw")}
        >
          {isDrawingMode
            ? drawingTool === "erase"
              ? `Eraser ${eraserStrokeWidth}px`
              : `Pencil ${drawingStrokeWidth}px`
            : "Draw"}
        </button>

        {showDrawMenu && (
          <div className={noteToolbarMenuClass}>
            <button
              type="button"
              className={!isDrawingMode ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white" : noteToolbarMenuItemClass}
              onClick={() => {
                setIsDrawingMode(false);
                setIsObjectSelectionMode(false);
                setSelectedObjectIds([]);
                setShowDrawMenu(false);
              }}
            >
              Text
            </button>

            <button
              type="button"
              className={
                drawingTool === "draw" && isDrawingMode
                  ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                  : noteToolbarMenuItemClass
              }
              onClick={() => {
                setIsDrawingMode(true);
                setDrawingTool("draw");
                setIsObjectSelectionMode(false);
                setSelectedObjectIds([]);
                setShowDrawMenu(false);
              }}
            >
              Pencil
            </button>

            <button
              type="button"
              className={
                drawingTool === "erase" && isDrawingMode
                  ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                  : noteToolbarMenuItemClass
              }
              onClick={() => {
                setIsDrawingMode(true);
                setDrawingTool("erase");
                setIsObjectSelectionMode(false);
                setSelectedObjectIds([]);
                setShowDrawMenu(false);
              }}
            >
              Eraser
            </button>

            <label
              className={
                isDarkNoteTheme
                  ? "mt-2 block rounded-lg border border-slate-700 bg-slate-800 p-3 text-xs text-slate-100"
                  : "mt-2 block rounded-lg border bg-gray-50 p-3 text-xs text-gray-700"
              }
            >
              {drawingTool === "erase" ? "Eraser" : "Pencil"} thickness:{" "}
              {drawingTool === "erase" ? eraserStrokeWidth : drawingStrokeWidth}
              px
              <input
                type="range"
                min="2"
                max={drawingTool === "erase" ? "48" : "16"}
                value={
                  drawingTool === "erase" ? eraserStrokeWidth : drawingStrokeWidth
                }
                className="mt-2 w-full"
                onChange={(event) => {
                  const nextWidth = Number(event.target.value);

                  if (drawingTool === "erase") {
                    setEraserStrokeWidth(nextWidth);
                  } else {
                    setDrawingStrokeWidth(nextWidth);
                  }

                  setIsDrawingMode(true);
                  setIsObjectSelectionMode(false);
                  setSelectedObjectIds([]);
                }}
              />
            </label>
          </div>
        )}
      </div>

      <button
        type="button"
        className={
          isObjectSelectionMode
            ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
            : noteToolbarButtonClass
        }
        onClick={() => {
          setIsObjectSelectionMode((current) => !current);
          setIsDrawingMode(false);
          setSelectedObjectIds([]);
        }}
      >
        Select Box
      </button>
    </>
  );

  const thumbnailScale = 0.14;
  const thumbnailWidth = pageWidth * thumbnailScale;
  const thumbnailHeight = pageHeight * thumbnailScale;
  const thumbnailBackgroundClass = isDarkNoteTheme
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

  function renderPagePreview(pageIndex: number) {
    const pageTop = pageIndex * pageHeight;
    const pageBottom = pageTop + pageHeight;
    const pageObjects = objects.filter((object) => {
      const objectBottom =
        object.type === "line"
          ? Math.max(object.y, object.endY ?? object.y + object.height)
          : object.y + object.height;

      return object.y < pageBottom && objectBottom >= pageTop;
    });

    return (
      <div
        className={`relative overflow-hidden rounded-lg border shadow-sm ${thumbnailBackgroundClass}`}
        style={{
          width: thumbnailWidth,
          height: thumbnailHeight,
        }}
      >
        {pageIndex === 0 && hasTypedContent && (
          <div
            className="absolute left-0 top-0 origin-top-left p-4 text-[16px] leading-8 text-gray-500"
            style={{
              width: 900,
              height: pageHeight,
              transform: `scale(${thumbnailScale})`,
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}

        {pageObjects.map((object) => (
          <div
            key={object.id}
            className="absolute overflow-hidden rounded-sm border border-gray-300/60 bg-white/70"
            style={{
              left: object.x * thumbnailScale,
              top: (object.y - pageTop) * thumbnailScale,
              width: Math.max(3, object.width * thumbnailScale),
              height: Math.max(3, object.height * thumbnailScale),
              backgroundColor:
                object.type === "rectangle" && object.filled
                  ? object.color
                  : undefined,
              borderColor: object.color,
            }}
          >
            {object.type === "textbox" && (
              <div
                className="origin-top-left whitespace-pre-wrap text-gray-700"
                style={{
                  width: object.width,
                  transform: `scale(${thumbnailScale})`,
                  color: object.color,
                  fontSize: object.fontSize,
                  fontFamily: object.fontFamily,
                }}
              >
                {object.text}
              </div>
            )}

            {object.type === "sticker" && object.src && (
              <img
                src={object.src}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <main ref={scrollContainerRef} className={notePageClass}>
      <Link
        href={`/subjects/${subjectId}`}
        className={noteBackButtonClass}
        aria-label="Back"
      >
        ←
      </Link>

      <header className={noteHeaderClass}>
        <h1 className={isDarkNoteTheme ? "text-xl font-bold text-slate-100" : "text-xl font-bold text-gray-950"}>
          {note.title}
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className={noteTopButtonClass}
            onClick={() => toggleExpandedNoteBox("note")}
            title="More"
          >
            <span
              aria-hidden="true"
              className="block h-5 w-5 bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: "url('/app-icons/setting.png')" }}
            />
          </button>

          <div className="relative">
            <button
              type="button"
              className={noteTopButtonClass}
              onClick={() => toggleExpandedNoteBox("pages")}
              title="Pages"
            >
              ...
            </button>

            {showNoteMenu && (
              <div className={notePanelClass}>
                <p className={isDarkNoteTheme ? "mb-2 text-xs font-semibold text-slate-400" : "mb-2 text-xs font-semibold text-gray-500"}>
                  Note Template
                </p>

                <div className="grid grid-cols-2 gap-2">
                  {(["plain", "lined", "grid", "dots"] as NoteTemplate[]).map(
                    (item) => (
                      <button
                        key={item}
                        type="button"
                        className={
                          template === item
                            ? "rounded-lg bg-black px-2 py-1 text-xs capitalize text-white"
                            : isDarkNoteTheme
                              ? "rounded-lg border border-slate-700 px-2 py-1 text-xs capitalize text-slate-100 hover:bg-slate-800"
                              : "rounded-lg border px-2 py-1 text-xs capitalize"
                        }
                        onClick={() => handleChangeTemplate(item)}
                      >
                        {item}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  className={isDarkNoteTheme ? "mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800" : "mt-3 w-full rounded-lg border px-3 py-2 text-left text-sm"}
                  onClick={handleSharePdf}
                >
                  Share as PDF
                </button>

                <button
                  type="button"
                  className={isDarkNoteTheme ? "mt-2 w-full rounded-lg border border-slate-700 px-3 py-2 text-left text-sm text-slate-100 hover:bg-slate-800" : "mt-2 w-full rounded-lg border px-3 py-2 text-left text-sm"}
                  onClick={handlePrintNote}
                >
                  Print note
                </button>
              </div>
            )}
          </div>

          <button
            className="rounded-lg bg-black px-4 py-2 text-white"
            onClick={handleSaveNote}
          >
            Save Note
          </button>
        </div>
      </header>

      {showPagePanel && (
        <aside className={noteSidePanelClass}>
          <p className={isDarkNoteTheme ? "mb-2 text-xs font-semibold text-slate-400" : "mb-2 text-xs font-semibold text-gray-500"}>Pages</p>
          <div className="space-y-2">
            {Array.from({ length: pageCount }, (_, index) => (
              <button
                key={index}
                type="button"
                className={noteSidePageButtonClass}
                onClick={() => scrollToPage(index)}
              >
                <span className={isDarkNoteTheme ? "mb-1 block text-xs font-semibold text-slate-300" : "mb-1 block text-xs font-semibold text-gray-600"}>
                  Page {index + 1}
                </span>
                {renderPagePreview(index)}
              </button>
            ))}
          </div>
        </aside>
      )}

      <section className="print-note-section flex min-h-[calc(100vh-89px)] flex-col items-center p-6">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <div>
            <p className="hidden text-sm font-medium text-gray-700">
              Template
            </p>

            <div className="hidden mt-2 flex-wrap gap-2">
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

            <div className="hidden">
              <div className="relative">
                <button
                  type="button"
                  className={
                    showAddMenu
                      ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
                      : "rounded-lg border px-3 py-1 text-sm"
                  }
                  onClick={() => toggleExpandedNoteBox("add")}
                >
                  Add
                </button>

                {showAddMenu && (
                  <div className="absolute left-0 top-9 z-[10001] w-52 rounded-xl border bg-white p-2 shadow-lg">
                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      onClick={() => {
                        addTextBox();
                        setShowAddMenu(false);
                      }}
                    >
                      Textbox
                    </button>

                    <label className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50">
                      Image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;

                          const reader = new FileReader();
                          reader.onload = () => {
                            const src = reader.result;
                            if (typeof src !== "string") return;

                            const imageElement = new window.Image();
                            imageElement.onload = () => {
                              const scale = Math.min(
                                320 / imageElement.naturalWidth,
                                240 / imageElement.naturalHeight,
                                1
                              );
                              void addImageObject(
                                src,
                                imageElement.naturalWidth * scale,
                                imageElement.naturalHeight * scale
                              );
                            };
                            imageElement.onerror = () =>
                              void addImageObject(src, 320, 200);
                            imageElement.src = src;
                          };
                          reader.readAsDataURL(file);
                          event.target.value = "";
                          setShowAddMenu(false);
                        }}
                      />
                    </label>

                    <button
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      onClick={() => setShowStickerPicker((current) => !current)}
                    >
                      Stickers
                    </button>

                    <select
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
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
                        setShowAddMenu(false);
                      }}
                    >
                      <option value="" disabled>
                        Shape
                      </option>
                      <option value="rectangle">Rectangle</option>
                      <option value="circle">Circle</option>
                      <option value="triangle">Triangle</option>
                      <option value="line">Line</option>
                    </select>

                    {showStickerPicker && (
                      <div className="mt-2 grid max-h-96 w-[28rem] grid-cols-4 gap-3 overflow-y-auto rounded-lg border bg-gray-50 p-3">
                        {stickerOptions.map((sticker) => (
                          <button
                            key={sticker.src}
                            type="button"
                            className="rounded-lg border bg-white p-1 text-left hover:bg-gray-100"
                            onClick={() => {
                              addSticker(sticker.src);
                              setShowStickerPicker(false);
                              setShowAddMenu(false);
                            }}
                          >
                            <img
                              src={sticker.src}
                              alt={sticker.label}
                              className="mx-auto h-20 w-20 object-contain"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                className={
                  isObjectSelectionMode
                    ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
                    : "rounded-lg border px-3 py-1 text-sm"
                }
                onClick={() => {
                  setIsObjectSelectionMode((current) => !current);
                  setIsDrawingMode(false);
                  setSelectedObjectIds([]);
                }}
              >
                {isObjectSelectionMode ? "Done Selecting" : "Select Objects"}
              </button>

              <div className="relative">
                <button
                  type="button"
                  className={
                    isDrawingMode
                      ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
                      : "rounded-lg border px-3 py-1 text-sm"
                  }
                  onClick={() => toggleExpandedNoteBox("draw")}
                >
                  {isDrawingMode
                    ? drawingTool === "erase"
                      ? `Eraser ${eraserStrokeWidth}px`
                      : `Pencil ${drawingStrokeWidth}px`
                    : "Draw"}
                </button>

                {showDrawMenu && (
                  <div className="absolute left-0 top-9 z-[10001] w-52 rounded-xl border bg-white p-2 shadow-lg">
                    <button
                      type="button"
                      className={
                        !isDrawingMode
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setIsDrawingMode(false);
                        setIsObjectSelectionMode(false);
                        setSelectedObjectIds([]);
                        setShowDrawMenu(false);
                      }}
                    >
                      Text
                    </button>

                    <button
                      type="button"
                      className={
                        drawingTool === "draw" && isDrawingMode
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setIsDrawingMode(true);
                        setDrawingTool("draw");
                        setIsObjectSelectionMode(false);
                        setSelectedObjectIds([]);
                        setShowDrawMenu(false);
                      }}
                    >
                      Pencil
                    </button>

                    <button
                      type="button"
                      className={
                        drawingTool === "erase" && isDrawingMode
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setIsDrawingMode(true);
                        setDrawingTool("erase");
                        setIsObjectSelectionMode(false);
                        setSelectedObjectIds([]);
                        setShowDrawMenu(false);
                      }}
                    >
                      Eraser
                    </button>

                    <label className="mt-2 block rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
                      {drawingTool === "erase" ? "Eraser" : "Pencil"} thickness:{" "}
                      {drawingTool === "erase"
                        ? eraserStrokeWidth
                        : drawingStrokeWidth}
                      px
                      <input
                        type="range"
                        min="2"
                        max={drawingTool === "erase" ? "48" : "16"}
                        value={
                          drawingTool === "erase"
                            ? eraserStrokeWidth
                            : drawingStrokeWidth
                        }
                        className="mt-2 w-full"
                        onChange={(event) => {
                          const nextWidth = Number(event.target.value);

                          if (drawingTool === "erase") {
                            setEraserStrokeWidth(nextWidth);
                          } else {
                            setDrawingStrokeWidth(nextWidth);
                          }

                          setIsDrawingMode(true);
                          setIsObjectSelectionMode(false);
                          setSelectedObjectIds([]);
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="hidden" ref={stickerPickerRef}>
                <button
                  type="button"
                  className="rounded-lg border px-3 py-1 text-sm"
                  onClick={() => setShowStickerPicker((current) => !current)}
                >
                  Stickers
                </button>

                {showStickerPicker && (
                  <div className="absolute left-0 top-10 z-[10001] w-80 rounded-xl border bg-white p-3 shadow-lg">
                    <p className="mb-2 text-sm font-semibold text-gray-800">
                      Choose a sticker
                    </p>

                    <div className="grid max-h-96 grid-cols-3 gap-4 overflow-y-auto">
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
                            className="mx-auto h-24 w-24 object-contain"
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
                hidden
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
                    selectedObject.type !== "line" &&
                    selectedObject.type !== "drawing" && (
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

                  {selectedObject.type !== "textbox" &&
                    selectedObject.type !== "sticker" &&
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
                    selectedObject.type !== "drawing" &&
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
          ref={canvasRef}
          className="print-note-canvas relative mx-auto"
          style={{ minHeight: canvasMinimumHeight, width: canvasWidth }}
          onPointerDown={() => {
            if (!isObjectSelectionMode && !isDrawingMode) {
              setSelectedObjectIds([]);
            }
          }}
        >
          <PaperBackground
            template={template}
            minimumHeight={canvasMinimumHeight}
            pageCount={pageCount}
            pageHeight={pageHeight}
            theme={data.settings.theme}
          >
            <RichNoteEditor
              content={content}
              onChange={setContent}
              minimumHeight={canvasMinimumHeight}
              defaultFontFamily={data.settings.default_font_family}
              defaultFontSize={data.settings.default_font_size}
              theme={data.settings.theme}
              sharedColor={shapeColor}
              onSharedColorChange={setShapeColor}
              toolbarControls={noteObjectToolbarControls}
              onContentHeightChange={setTextContentHeight}
            />
          </PaperBackground>

          <NoteObjectLayer
            objects={objects}
            selectedObjectIds={selectedObjectIds}
            onSelectionChange={setSelectedObjectIds}
            onChangeObjects={handleChangeObjects}
            selectionMode={isObjectSelectionMode}
            drawingMode={isDrawingMode}
            drawingTool={drawingTool}
            drawingColor={shapeColor}
            drawingStrokeWidth={
              drawingTool === "erase" ? eraserStrokeWidth : drawingStrokeWidth
            }
            theme={data.settings.theme}
            saveRequestId={saveRequestId}
            undoRequestId={drawingUndoRequestId}
            onPendingDrawingCountChange={handlePendingDrawingCountChange}
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            pageCount={pageCount}
          />
        </div>
      </section>
    </main>
  );
}
