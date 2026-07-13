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
  updateNotePages,
  updateNoteTemplate,
} from "@/lib/study-actions";
import { PaperBackground } from "@/components/PaperBackground";
import { RichNoteEditor } from "@/components/RichNoteEditor";
import { NoteObjectLayer } from "@/components/NoteObjectLayer";
import { StoredImage } from "@/components/StoredImage";
import { storeImageDataUrl } from "@/lib/image-storage";
import { createEditableNoteFile } from "@/lib/note-transfer";

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
  const [manualPageCount, setManualPageCount] = useState(1);
  const [pageBookmarks, setPageBookmarks] = useState<number[]>([]);
  const [openPageMenuIndex, setOpenPageMenuIndex] = useState<number | null>(null);
  const [hasPageClipboard, setHasPageClipboard] = useState(false);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [isObjectSelectionMode, setIsObjectSelectionMode] = useState(false);
  const [selectionTool, setSelectionTool] = useState<"rectangle" | "lasso">(
    "rectangle"
  );
  const [noteMode, setNoteMode] = useState<"text" | "draw">("text");
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<"draw" | "erase" | "highlight">(
    "draw"
  );
  const [shapeColor, setShapeColor] = useState("#111827");
  const [drawingStrokeWidth, setDrawingStrokeWidth] = useState(
    defaultData.settings.default_pencil_thickness
  );
  const [eraserStrokeWidth, setEraserStrokeWidth] = useState(
    defaultData.settings.default_eraser_thickness
  );
  const [highlighterStrokeWidth, setHighlighterStrokeWidth] = useState(
    defaultData.settings.default_highlighter_thickness
  );
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showDrawMenu, setShowDrawMenu] = useState(false);
  const [showSelectMenu, setShowSelectMenu] = useState(false);
  const [showPagePanel, setShowPagePanel] = useState(false);
  const [showNoteMenu, setShowNoteMenu] = useState(false);
  const [textContentHeight, setTextContentHeight] = useState(0);
  const [saveRequestId, setSaveRequestId] = useState(0);
  const [isNoteSaved, setIsNoteSaved] = useState(false);
  const [drawingUndoRequestId, setDrawingUndoRequestId] = useState(0);
  const [drawingRedoRequestId, setDrawingRedoRequestId] = useState(0);
  const [noteZoom, setNoteZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const stickerPickerRef = useRef<HTMLDivElement | null>(null);
  const pendingDrawingCountRef = useRef(0);
  const skipNextObjectDirtyMarkRef = useRef(false);
  const drawingObjectRedoStackRef = useRef<NoteObject[]>([]);
  const tabletGestureRef = useRef<{
    touchCount: number;
    startX: number;
    startY: number;
    startTime: number;
    maxMove: number;
  } | null>(null);
  const undoStackRef = useRef<
    Array<{
      content: string;
      objects: NoteObject[];
      template: NoteTemplate;
    }>
  >([]);
  const redoStackRef = useRef<
    Array<{
      content: string;
      objects: NoteObject[];
      template: NoteTemplate;
    }>
  >([]);
  const isApplyingHistoryRef = useRef(false);
  const pageWidth = 794;
  const pageHeight = 1123;
  const PAGE_CLIPBOARD_KEY = "just-study-page-clipboard";

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
      undoStackRef.current = [];
      redoStackRef.current = [];
      drawingObjectRedoStackRef.current = [];
      setManualPageCount(foundNote?.page_count ?? 1);
      setPageBookmarks(foundNote?.page_bookmarks ?? []);
      setHasPageClipboard(
        typeof window !== "undefined" &&
          window.localStorage.getItem(PAGE_CLIPBOARD_KEY) !== null
      );
      setCursorStyle(loadedData.settings.cursor_style);
      setDrawingStrokeWidth(loadedData.settings.default_pencil_thickness);
      setEraserStrokeWidth(loadedData.settings.default_eraser_thickness);
      setHighlighterStrokeWidth(
        loadedData.settings.default_highlighter_thickness
      );
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
    target: "note" | "pages" | "add" | "draw" | "select"
  ) {
    const isTargetOpen =
      target === "note"
        ? showNoteMenu
        : target === "pages"
          ? showPagePanel
          : target === "add"
            ? showAddMenu
            : target === "draw"
              ? showDrawMenu
              : showSelectMenu;
    const shouldOpenTarget = !isTargetOpen;

    setShowNoteMenu(shouldOpenTarget && target === "note");
    setShowPagePanel(shouldOpenTarget && target === "pages");
    setShowAddMenu(shouldOpenTarget && target === "add");
    setShowDrawMenu(shouldOpenTarget && target === "draw");
    setShowSelectMenu(shouldOpenTarget && target === "select");

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

  function getCurrentUndoSnapshot() {
    return {
      content,
      objects,
      template,
    };
  }

  function applyHistorySnapshot(snapshot: {
    content: string;
    objects: NoteObject[];
    template: NoteTemplate;
  }) {
    isApplyingHistoryRef.current = true;
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
    setIsNoteSaved(false);
    setSelectedObjectIds([]);

    requestAnimationFrame(() => {
      isApplyingHistoryRef.current = false;
    });
  }

  function pushUndoSnapshot({ clearRedo = true } = {}) {
    const latestSnapshot = undoStackRef.current.at(-1);
    const nextSnapshot = getCurrentUndoSnapshot();

    if (
      latestSnapshot &&
      latestSnapshot.content === nextSnapshot.content &&
      latestSnapshot.template === nextSnapshot.template &&
      JSON.stringify(latestSnapshot.objects) === JSON.stringify(nextSnapshot.objects)
    ) {
      return;
    }

    undoStackRef.current = [...undoStackRef.current.slice(-49), nextSnapshot];
    if (clearRedo) {
      redoStackRef.current = [];
      drawingObjectRedoStackRef.current = [];
    }
  }

  function applyUndoSnapshot() {
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return false;

    redoStackRef.current = [
      ...redoStackRef.current.slice(-49),
      getCurrentUndoSnapshot(),
    ];
    applyHistorySnapshot(snapshot);
    return true;
  }

  function applyRedoSnapshot() {
    const snapshot = redoStackRef.current.pop();
    if (!snapshot) return false;

    pushUndoSnapshot({ clearRedo: false });
    applyHistorySnapshot(snapshot);
    return true;
  }

  function handleSaveNote() {
    skipNextObjectDirtyMarkRef.current = pendingDrawingCountRef.current > 0;
    setSaveRequestId((current) => current + 1);

    const updatedData = updateNoteContent(
      data,
      subjectId,
      noteId,
      content
    );

    setData(updatedData);
    setIsNoteSaved(true);
  }

  function handlePrintNote() {
    setSelectedObjectIds([]);
    setShowNoteMenu(false);
    setShowPagePanel(false);
    setShowAddMenu(false);
    setShowDrawMenu(false);
    setShowSelectMenu(false);
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
  setIsNoteSaved(false);

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
    if (skipNextObjectDirtyMarkRef.current) {
      skipNextObjectDirtyMarkRef.current = false;
    } else {
      setIsNoteSaved(false);
    }

    const updatedData = updateNoteObjects(
      data,
      subjectId,
      noteId,
      newObjects
    );

    setData(updatedData);
  }

  function cloneNoteObject(object: NoteObject, index: number): NoteObject {
    return {
      ...structuredClone(object),
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${object.id}-page-copy-${index}`,
    };
  }

  function getObjectPageBounds(object: NoteObject) {
    if (object.type === "line") {
      const startY =
        object.endX !== undefined && object.endY !== undefined
          ? object.y
          : object.y + object.height;
      const endY = object.endY ?? object.y;

      return {
        top: Math.min(startY, endY),
        bottom: Math.max(startY, endY),
      };
    }

    return {
      top: object.y,
      bottom: object.y + object.height,
    };
  }

  function isObjectOnPage(object: NoteObject, pageIndex: number) {
    const pageTop = pageIndex * pageHeight;
    const pageBottom = pageTop + pageHeight;
    const bounds = getObjectPageBounds(object);

    return bounds.top < pageBottom && bounds.bottom >= pageTop;
  }

  function moveObjectByPages(object: NoteObject, pageDelta: number) {
    const yDelta = pageDelta * pageHeight;

    if (object.type === "line") {
      return {
        ...object,
        y: object.y + yDelta,
        endY: (object.endY ?? object.y) + yDelta,
      };
    }

    return {
      ...object,
      y: object.y + yDelta,
    };
  }

  function normalizeObjectToPage(object: NoteObject, pageIndex: number) {
    const pageTop = pageIndex * pageHeight;

    if (object.type === "line") {
      return {
        ...object,
        y: object.y - pageTop,
        endY: (object.endY ?? object.y) - pageTop,
      };
    }

    return {
      ...object,
      y: object.y - pageTop,
    };
  }

  function placeObjectOnPage(object: NoteObject, pageIndex: number, index: number) {
    const pageTop = pageIndex * pageHeight;
    const clonedObject = cloneNoteObject(object, index);

    if (clonedObject.type === "line") {
      return {
        ...clonedObject,
        y: clonedObject.y + pageTop,
        endY: (clonedObject.endY ?? clonedObject.y) + pageTop,
      };
    }

    return {
      ...clonedObject,
      y: clonedObject.y + pageTop,
    };
  }

  function savePageState(
    nextObjects: NoteObject[],
    nextPageCount = manualPageCount,
    nextBookmarks = pageBookmarks
  ) {
    pushUndoSnapshot();
    setObjects(nextObjects);
    setManualPageCount(Math.max(1, nextPageCount));
    setPageBookmarks(nextBookmarks);
    setIsNoteSaved(false);

    setData(
      updateNotePages(data, subjectId, noteId, {
        objects: nextObjects,
        page_count: Math.max(1, nextPageCount),
        page_bookmarks: nextBookmarks,
      })
    );
  }

  function getCopiedPageObjects(pageIndex: number) {
    return objects
      .filter((object) => isObjectOnPage(object, pageIndex))
      .map((object) => normalizeObjectToPage(object, pageIndex));
  }

  function copyPageToClipboard(pageIndex: number) {
    const pageObjects = getCopiedPageObjects(pageIndex);

    window.localStorage.setItem(
      PAGE_CLIPBOARD_KEY,
      JSON.stringify({
        objects: pageObjects,
        copiedAt: new Date().toISOString(),
      })
    );
    setHasPageClipboard(true);
  }

  function readPageClipboard() {
    const rawClipboard = window.localStorage.getItem(PAGE_CLIPBOARD_KEY);
    if (!rawClipboard) return null;

    try {
      const parsed = JSON.parse(rawClipboard) as { objects?: NoteObject[] };
      return Array.isArray(parsed.objects) ? parsed.objects : null;
    } catch {
      return null;
    }
  }

  function addBlankPageBelow(pageIndex: number) {
    const insertAfterY = (pageIndex + 1) * pageHeight;
    const nextObjects = objects.map((object) =>
      getObjectPageBounds(object).top >= insertAfterY
        ? moveObjectByPages(object, 1)
        : object
    );
    const nextBookmarks = pageBookmarks.map((bookmark) =>
      bookmark > pageIndex ? bookmark + 1 : bookmark
    );

    savePageState(
      nextObjects,
      Math.max(pageCount + 1, manualPageCount + 1),
      nextBookmarks
    );
    setOpenPageMenuIndex(null);
  }

  function clearPage(pageIndex: number) {
    savePageState(
      objects.filter((object) => !isObjectOnPage(object, pageIndex)),
      manualPageCount
    );
    setOpenPageMenuIndex(null);
  }

  function deletePage(pageIndex: number) {
    if (pageCount <= 1) {
      clearPage(pageIndex);
      return;
    }

    const pageTop = pageIndex * pageHeight;
    const pageBottom = pageTop + pageHeight;
    const nextObjects = objects
      .filter((object) => !isObjectOnPage(object, pageIndex))
      .map((object) =>
        getObjectPageBounds(object).top >= pageBottom
          ? moveObjectByPages(object, -1)
          : object
      );
    const nextBookmarks = pageBookmarks
      .filter((bookmark) => bookmark !== pageIndex)
      .map((bookmark) => (bookmark > pageIndex ? bookmark - 1 : bookmark));

    savePageState(nextObjects, Math.max(1, manualPageCount - 1), nextBookmarks);
    setOpenPageMenuIndex(null);
  }

  function cutPage(pageIndex: number) {
    copyPageToClipboard(pageIndex);
    deletePage(pageIndex);
  }

  function pastePageBelow(pageIndex: number) {
    const clipboardObjects = readPageClipboard();
    if (!clipboardObjects) return;

    const pastePageIndex = pageIndex + 1;
    const insertY = pastePageIndex * pageHeight;
    const shiftedObjects = objects.map((object) =>
      getObjectPageBounds(object).top >= insertY
        ? moveObjectByPages(object, 1)
        : object
    );
    const pastedObjects = clipboardObjects.map((object, index) =>
      placeObjectOnPage(object, pastePageIndex, index)
    );
    const nextBookmarks = pageBookmarks.map((bookmark) =>
      bookmark >= pastePageIndex ? bookmark + 1 : bookmark
    );

    savePageState(
      [...shiftedObjects, ...pastedObjects],
      Math.max(pageCount + 1, manualPageCount + 1),
      nextBookmarks
    );
    setOpenPageMenuIndex(null);
  }

  function duplicatePage(pageIndex: number) {
    const pageObjects = getCopiedPageObjects(pageIndex);
    const pastePageIndex = pageIndex + 1;
    const insertY = pastePageIndex * pageHeight;
    const shiftedObjects = objects.map((object) =>
      getObjectPageBounds(object).top >= insertY
        ? moveObjectByPages(object, 1)
        : object
    );
    const duplicatedObjects = pageObjects.map((object, index) =>
      placeObjectOnPage(object, pastePageIndex, index)
    );
    const nextBookmarks = pageBookmarks.map((bookmark) =>
      bookmark >= pastePageIndex ? bookmark + 1 : bookmark
    );

    savePageState(
      [...shiftedObjects, ...duplicatedObjects],
      Math.max(pageCount + 1, manualPageCount + 1),
      nextBookmarks
    );
    setOpenPageMenuIndex(null);
  }

  function togglePageBookmark(pageIndex: number) {
    const nextBookmarks = pageBookmarks.includes(pageIndex)
      ? pageBookmarks.filter((bookmark) => bookmark !== pageIndex)
      : [...pageBookmarks, pageIndex].sort((a, b) => a - b);

    setPageBookmarks(nextBookmarks);
    setData(
      updateNotePages(data, subjectId, noteId, {
        page_bookmarks: nextBookmarks,
        page_count: manualPageCount,
        objects,
      })
    );
  }

  function undoLatestSavedDrawingStroke() {
    let latestDrawingIndex = -1;
    for (let index = objects.length - 1; index >= 0; index -= 1) {
      if (objects[index].type === "drawing") {
        latestDrawingIndex = index;
        break;
      }
    }

    if (latestDrawingIndex === -1) return false;

    const latestDrawing = objects[latestDrawingIndex];
    drawingObjectRedoStackRef.current = [
      ...drawingObjectRedoStackRef.current.slice(-49),
      latestDrawing,
    ];

    handleChangeObjects(
      objects.filter((object) => object.id !== latestDrawing.id)
    );
    return true;
  }

  function redoLatestSavedDrawingStroke() {
    const drawingToRestore = drawingObjectRedoStackRef.current.pop();
    if (!drawingToRestore) return false;

    handleChangeObjects([...objects, drawingToRestore]);
    return true;
  }

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isFormField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      const isUndoShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z";
      const isRedoShortcut =
        ((event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "z") ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y");

      if ((!isUndoShortcut && !isRedoShortcut) || isFormField) {
        return;
      }

      event.preventDefault();

      if (isRedoShortcut) {
        if (applyRedoSnapshot()) return;
        setDrawingRedoRequestId((current) => current + 1);
        if (redoLatestSavedDrawingStroke()) return;
        return;
      }

      if (pendingDrawingCountRef.current > 0) {
        setDrawingUndoRequestId((current) => current + 1);
        return;
      }

      if (applyUndoSnapshot()) {
        return;
      }

      undoLatestSavedDrawingStroke();
    }

    window.addEventListener("keydown", handleUndoShortcut);

    return () => window.removeEventListener("keydown", handleUndoShortcut);
  });

  function handlePendingDrawingCountChange(count: number) {
    pendingDrawingCountRef.current = count;
  }

  function clampZoom(value: number) {
    return Math.min(2.2, Math.max(0.6, value));
  }

  function handleChangeNoteZoom(nextZoom: number) {
    setNoteZoom(clampZoom(nextZoom));
  }

  function getTouchCenter(touches: TouchList) {
    const firstTouch = touches[0];
    const secondTouch = touches[1];

    if (!firstTouch || !secondTouch) {
      return { x: 0, y: 0 };
    }

    return {
      x: (firstTouch.clientX + secondTouch.clientX) / 2,
      y: (firstTouch.clientY + secondTouch.clientY) / 2,
    };
  }

  function runTabletUndoGesture() {
    if (pendingDrawingCountRef.current > 0) {
      setDrawingUndoRequestId((current) => current + 1);
      return;
    }

    if (applyUndoSnapshot()) {
      return;
    }

    undoLatestSavedDrawingStroke();
  }

  function runTabletRedoGesture() {
    if (applyRedoSnapshot()) {
      return;
    }

    setDrawingRedoRequestId((current) => current + 1);
    if (redoLatestSavedDrawingStroke()) {
      return;
    }
  }

  useEffect(() => {
    function handleTouchStart(event: TouchEvent) {
      if (event.touches.length !== 2 && event.touches.length !== 3) {
        tabletGestureRef.current = null;
        return;
      }

      const center = getTouchCenter(event.touches);

      tabletGestureRef.current = {
        touchCount: event.touches.length,
        startX: center.x,
        startY: center.y,
        startTime: Date.now(),
        maxMove: 0,
      };
    }

    function handleTouchMove(event: TouchEvent) {
      const gesture = tabletGestureRef.current;
      if (!gesture || event.touches.length !== gesture.touchCount) return;

      const center = getTouchCenter(event.touches);
      gesture.maxMove = Math.max(
        gesture.maxMove,
        Math.hypot(center.x - gesture.startX, center.y - gesture.startY)
      );
    }

    function handleTouchEnd(event: TouchEvent) {
      if (event.touches.length > 0) return;

      const gesture = tabletGestureRef.current;
      tabletGestureRef.current = null;
      if (!gesture) return;

      const duration = Date.now() - gesture.startTime;
      const isTapGesture = duration <= 430 && gesture.maxMove <= 28;

      if (!isTapGesture) return;

      event.preventDefault();

      if (gesture.touchCount === 2) {
        runTabletUndoGesture();
        return;
      }

      if (gesture.touchCount === 3) {
        runTabletRedoGesture();
      }
    }

    window.addEventListener("touchstart", handleTouchStart, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchmove", handleTouchMove, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchend", handleTouchEnd, {
      capture: true,
    });
    window.addEventListener("touchcancel", handleTouchEnd, {
      capture: true,
    });

    return () => {
      tabletGestureRef.current = null;

      window.removeEventListener("touchstart", handleTouchStart, {
        capture: true,
      });
      window.removeEventListener("touchmove", handleTouchMove, {
        capture: true,
      });
      window.removeEventListener("touchend", handleTouchEnd, {
        capture: true,
      });
      window.removeEventListener("touchcancel", handleTouchEnd, {
        capture: true,
      });
    };
  });

  function handleChangeContent(nextContent: string) {
    if (isApplyingHistoryRef.current) {
      setContent(nextContent);
      return;
    }

    if (nextContent !== content) {
      pushUndoSnapshot();
    }

    setContent(nextContent);
    if (nextContent !== content) {
      setIsNoteSaved(false);
    }
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

  function switchToTextMode() {
    setNoteMode("text");
    setIsDrawingMode(false);
    setDrawingTool("draw");
    setIsObjectSelectionMode(false);
    setSelectedObjectIds([]);
    setShowDrawMenu(false);
  }

  function switchToDrawMode() {
    setNoteMode("draw");
    setIsDrawingMode(true);
    setDrawingTool("draw");
    setIsObjectSelectionMode(false);
    setSelectedObjectIds([]);
    setShowDrawMenu(false);
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
    setShowSelectMenu(false);
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

  function downloadFile(file: File) {
    const fileUrl = URL.createObjectURL(file);
    const downloadLink = document.createElement("a");

    downloadLink.href = fileUrl;
    downloadLink.download = file.name;
    downloadLink.rel = "noopener";
    downloadLink.style.display = "none";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
  }

  async function handleExportEditableNote() {
    if (!note) return;

    setSelectedObjectIds([]);
    setShowNoteMenu(false);
    setShowPagePanel(false);
    setShowAddMenu(false);
    setShowDrawMenu(false);
    setShowSelectMenu(false);
    setShowStickerPicker(false);
    setIsObjectSelectionMode(false);

    const exportNote: Note = {
      ...note,
      content,
      template,
      objects,
      page_count: pageCount,
      page_bookmarks: pageBookmarks,
      updated_at: new Date().toISOString(),
    };
    const file = await createEditableNoteFile(exportNote);

    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: exportNote.title,
          files: [file],
        });
        return;
      }
    } catch (error) {
      console.warn("Editable note sharing was blocked. Downloading instead.", error);
    }

    downloadFile(file);
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

  function readImageFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Could not read image file."));
      };
      reader.onerror = () => reject(new Error("Could not read image file."));
      reader.readAsDataURL(file);
    });
  }

  function getFittedImageSize(src: string) {
    return new Promise<{ width: number; height: number }>((resolve) => {
      const imageElement = new window.Image();
      imageElement.onload = () => {
        const scale = Math.min(
          320 / imageElement.naturalWidth,
          240 / imageElement.naturalHeight,
          1
        );

        resolve({
          width: imageElement.naturalWidth * scale,
          height: imageElement.naturalHeight * scale,
        });
      };
      imageElement.onerror = () => resolve({ width: 320, height: 200 });
      imageElement.src = src;
    });
  }

  async function addImageFileToNote(file: File) {
    const src = await readImageFileAsDataUrl(file);
    const size = await getFittedImageSize(src);
    await addImageObject(src, size.width, size.height);
  }

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const clipboardData = event.clipboardData;
      const imageFile =
        Array.from(clipboardData?.files ?? []).find((file) =>
          file.type.startsWith("image/")
        ) ??
        Array.from(clipboardData?.items ?? [])
          .find((item) => item.type.startsWith("image/"))
          ?.getAsFile();

      if (!imageFile) return;

      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (isEditableTarget && target?.tagName !== "DIV") return;

      event.preventDefault();
      void addImageFileToNote(imageFile);
    }

    window.addEventListener("paste", handlePaste);

    return () => window.removeEventListener("paste", handlePaste);
  });

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
  const automaticPageCount =
    usedBottom > 0 ? Math.max(2, Math.ceil(usedBottom / pageHeight) + 1) : 1;
  const pageCount = Math.max(manualPageCount, automaticPageCount);
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
    ? "no-print flex min-h-20 items-start border-b border-slate-800 bg-slate-950 px-16 pt-3 text-slate-100"
    : "no-print flex min-h-20 items-start border-b bg-white px-16 pt-3";
  const noteTopButtonClass = isDarkNoteTheme
    ? "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
    : "rounded-lg border px-3 py-2 text-sm";
  const noteBackButtonClass = isDarkNoteTheme
    ? "no-print fixed left-4 top-4 z-[60] rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-base leading-none text-slate-100 shadow-sm hover:bg-slate-800"
    : "no-print fixed left-4 top-4 z-[60] rounded-md border bg-white px-2.5 py-1 text-base leading-none shadow-sm";
  const notePanelClass = isDarkNoteTheme
    ? "absolute right-0 top-12 z-[10002] w-52 rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-lg"
    : "absolute right-0 top-12 z-[10002] w-52 rounded-xl border bg-white p-3 shadow-lg";
  const noteSidePanelClass = isDarkNoteTheme
    ? "no-print fixed right-4 top-20 z-50 max-h-[calc(100vh-6rem)] w-44 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-lg"
    : "no-print fixed right-4 top-20 z-50 max-h-[calc(100vh-6rem)] w-44 overflow-y-auto rounded-xl border bg-white p-3 shadow-lg";
  const noteSidePageButtonClass = isDarkNoteTheme
    ? "w-full rounded-lg border border-slate-700 bg-slate-800 p-2 text-left text-sm text-slate-100 hover:bg-slate-700"
    : "w-full rounded-lg border bg-gray-50 p-2 text-left text-sm hover:bg-gray-100";
  const notePageActionMenuClass = isDarkNoteTheme
    ? "absolute bottom-7 left-1 z-20 w-36 rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs text-slate-100 shadow-lg"
    : "absolute bottom-7 left-1 z-20 w-36 rounded-lg border bg-white p-1 text-xs shadow-lg";
  const notePageActionButtonClass = isDarkNoteTheme
    ? "block w-full rounded-md px-2 py-1 text-left hover:bg-slate-800"
    : "block w-full rounded-md px-2 py-1 text-left hover:bg-gray-100";
  const activeDrawingThickness =
    drawingTool === "erase"
      ? eraserStrokeWidth
      : drawingTool === "highlight"
        ? highlighterStrokeWidth
        : drawingStrokeWidth;
  const activeDrawingToolLabel =
    drawingTool === "erase"
      ? "Eraser"
      : drawingTool === "highlight"
        ? "Highlighter"
        : "Pencil";
  const activeDrawingMaxThickness =
    drawingTool === "erase" || drawingTool === "highlight" ? 48 : 32;

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
            ? `${activeDrawingToolLabel} ${activeDrawingThickness}px`
            : "Draw"}
        </button>

        {showDrawMenu && (
          <div className={noteToolbarMenuClass}>
            <button
              type="button"
              className={
                noteMode === "draw" && !isDrawingMode
                  ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                  : noteToolbarMenuItemClass
              }
              onClick={() => {
                setNoteMode("draw");
                setIsDrawingMode(false);
                setIsObjectSelectionMode(false);
                setSelectedObjectIds([]);
                setShowDrawMenu(false);
              }}
            >
              Text / Pan
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

            <button
              type="button"
              className={
                drawingTool === "highlight" && isDrawingMode
                  ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                  : noteToolbarMenuItemClass
              }
              onClick={() => {
                setIsDrawingMode(true);
                setDrawingTool("highlight");
                setIsObjectSelectionMode(false);
                setSelectedObjectIds([]);
                setShowDrawMenu(false);
              }}
            >
              Highlight
            </button>

            <label
              className={
                isDarkNoteTheme
                  ? "mt-2 block rounded-lg border border-slate-700 bg-slate-800 p-3 text-xs text-slate-100"
                  : "mt-2 block rounded-lg border bg-gray-50 p-3 text-xs text-gray-700"
              }
            >
              {activeDrawingToolLabel} thickness: {activeDrawingThickness}px
              <input
                type="range"
                min="2"
                max={activeDrawingMaxThickness}
                value={activeDrawingThickness}
                className="mt-2 w-full"
                onChange={(event) => {
                  const nextWidth = Number(event.target.value);

                  if (drawingTool === "erase") {
                    setEraserStrokeWidth(nextWidth);
                  } else if (drawingTool === "highlight") {
                    setHighlighterStrokeWidth(nextWidth);
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

      <div className="relative">
        <button
          type="button"
          className={
            isObjectSelectionMode
              ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
              : noteToolbarButtonClass
          }
          onClick={() => toggleExpandedNoteBox("select")}
        >
          {isObjectSelectionMode
            ? selectionTool === "lasso"
              ? "Draw Select"
              : "Rectangle Select"
            : "Select Box"}
        </button>

        {showSelectMenu && (
          <div className={noteToolbarMenuClass}>
            <button
              type="button"
              className={
                isObjectSelectionMode && selectionTool === "rectangle"
                  ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                  : noteToolbarMenuItemClass
              }
              onClick={() => {
                setSelectionTool("rectangle");
                setIsObjectSelectionMode(true);
                setIsDrawingMode(false);
                setSelectedObjectIds([]);
                setShowSelectMenu(false);
              }}
            >
              Rectangle Select
            </button>
            <button
              type="button"
              className={
                isObjectSelectionMode && selectionTool === "lasso"
                  ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                  : noteToolbarMenuItemClass
              }
              onClick={() => {
                setSelectionTool("lasso");
                setIsObjectSelectionMode(true);
                setIsDrawingMode(false);
                setSelectedObjectIds([]);
                setShowSelectMenu(false);
              }}
            >
              Draw Select
            </button>
            {isObjectSelectionMode && (
              <button
                type="button"
                className={noteToolbarMenuItemClass}
                onClick={() => {
                  setIsObjectSelectionMode(false);
                  setSelectedObjectIds([]);
                  setShowSelectMenu(false);
                }}
              >
                Done Selecting
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );

  const thumbnailScale = 0.14;
  const thumbnailWidth = pageWidth * thumbnailScale;
  const thumbnailHeight = pageHeight * thumbnailScale;
  const thumbnailBackgroundColor = isDarkNoteTheme ? "#111827" : "#ffffff";
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
    const pageObjects = objects.filter((object) => isObjectOnPage(object, pageIndex));
    const getImageCropStyle = (object: NoteObject) => {
      const crop = object.crop ?? { left: 0, top: 0, right: 0, bottom: 0 };
      const visibleWidth = Math.max(0.1, 1 - crop.left - crop.right);
      const visibleHeight = Math.max(0.1, 1 - crop.top - crop.bottom);

      return {
        left: `${(-crop.left / visibleWidth) * 100}%`,
        top: `${(-crop.top / visibleHeight) * 100}%`,
        width: `${(1 / visibleWidth) * 100}%`,
        height: `${(1 / visibleHeight) * 100}%`,
      };
    };
    const getDrawingPath = (points: { x: number; y: number }[] = []) =>
      points
        .map((point, index) =>
          index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
        )
        .join(" ");
    const getLinePoints = (object: NoteObject) => ({
      startX: object.x,
      startY:
        object.endX !== undefined && object.endY !== undefined
          ? object.y
          : object.y + object.height,
      endX: object.endX ?? object.x + object.width,
      endY: object.endY ?? object.y,
    });

    return (
      <div
        className={`relative overflow-hidden rounded-lg border shadow-sm ${thumbnailBackgroundClass}`}
        style={{
          width: thumbnailWidth,
          height: thumbnailHeight,
          backgroundColor: thumbnailBackgroundColor,
        }}
      >
        {hasTypedContent && (
          <div
            className="absolute left-0 origin-top-left p-4 text-[16px] leading-8 text-gray-500 [&_h1]:m-0 [&_h2]:m-0 [&_h3]:m-0 [&_li]:m-0 [&_li]:min-h-8 [&_li]:leading-[32px] [&_p]:m-0 [&_p]:min-h-8 [&_p]:leading-[32px]"
            style={{
              top: -(pageTop * thumbnailScale),
              width: pageWidth,
              minHeight: canvasPixelHeight,
              transform: `scale(${thumbnailScale})`,
              transformOrigin: "top left",
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        )}

        {pageObjects.map((object) => {
          if (object.type === "line") {
            const points = getLinePoints(object);

            return (
              <svg
                key={object.id}
                className="absolute inset-0 h-full w-full overflow-visible"
              >
                <line
                  x1={points.startX * thumbnailScale}
                  y1={(points.startY - pageTop) * thumbnailScale}
                  x2={points.endX * thumbnailScale}
                  y2={(points.endY - pageTop) * thumbnailScale}
                  stroke={object.color ?? "#111827"}
                  strokeWidth={Math.max(1, (object.strokeWidth ?? 5) * thumbnailScale)}
                  strokeLinecap="round"
                />
              </svg>
            );
          }

          return (
            <div
              key={object.id}
              className="absolute overflow-hidden"
              style={{
                left: object.x * thumbnailScale,
                top: (object.y - pageTop) * thumbnailScale,
                width: Math.max(3, object.width * thumbnailScale),
                height: Math.max(3, object.height * thumbnailScale),
                transform: `rotate(${object.rotation ?? 0}deg) scale(${object.flipX ? -1 : 1}, ${
                  object.flipY ? -1 : 1
                })`,
                transformOrigin: "center",
              }}
            >
              {object.type === "textbox" && (
                <div
                  className="origin-top-left whitespace-pre-wrap"
                  style={{
                    width: object.width,
                    transform: `scale(${thumbnailScale})`,
                    transformOrigin: "top left",
                    color: object.color ?? (isDarkNoteTheme ? "#f8fafc" : "#111827"),
                    fontSize: object.fontSize,
                    fontFamily: object.fontFamily,
                  }}
                  dangerouslySetInnerHTML={{
                    __html: object.html ?? object.text ?? "",
                  }}
                />
              )}

              {object.type === "sticker" && object.src && (
                <img
                  src={object.src}
                  alt=""
                  className="h-full w-full object-fill"
                  draggable={false}
                />
              )}

              {object.type === "image" && object.src && (
                <div className="relative h-full w-full overflow-hidden">
                  <StoredImage
                    src={object.src}
                    alt=""
                    className="absolute object-fill"
                    style={getImageCropStyle(object)}
                  />
                </div>
              )}

              {object.type === "drawing" && (
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
                  preserveAspectRatio="none"
                  className="overflow-visible"
                >
                  <path
                    d={getDrawingPath(object.points)}
                    fill="none"
                    stroke={object.color ?? "#111827"}
                    strokeOpacity={object.drawingTool === "highlight" ? 0.45 : 1}
                    strokeWidth={object.strokeWidth ?? 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}

              {(object.type === "rectangle" ||
                object.type === "circle" ||
                object.type === "triangle") && (
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
                  preserveAspectRatio="none"
                >
                  {object.type === "circle" ? (
                    <ellipse
                      cx={object.width / 2}
                      cy={object.height / 2}
                      rx={object.width / 2}
                      ry={object.height / 2}
                      fill={object.filled ? object.color ?? "#111827" : "transparent"}
                      stroke={object.color ?? "#111827"}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : (
                    <polygon
                      points={
                        object.vertices?.length
                          ? object.vertices
                              .map((vertex) => `${vertex.x},${vertex.y}`)
                              .join(" ")
                          : object.type === "triangle"
                            ? `${object.width / 2},0 ${object.width},${object.height} 0,${object.height}`
                            : `0,0 ${object.width},0 ${object.width},${object.height} 0,${object.height}`
                      }
                      fill={object.filled ? object.color ?? "#111827" : "transparent"}
                      stroke={object.color ?? "#111827"}
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main
      ref={scrollContainerRef}
      className={notePageClass}
      style={{ touchAction: "pan-y" }}
    >
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

        <div className="no-print fixed right-6 top-4 z-[10001] flex items-center gap-2">
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
                  Note Mode
                </p>

                <div className="mb-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={
                      noteMode === "text"
                        ? "rounded-lg bg-blue-600 px-2 py-1 text-xs text-white"
                        : isDarkNoteTheme
                          ? "rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                          : "rounded-lg border px-2 py-1 text-xs"
                    }
                    onClick={switchToTextMode}
                  >
                    Text
                  </button>

                  <button
                    type="button"
                    className={
                      noteMode === "draw"
                        ? "rounded-lg bg-blue-600 px-2 py-1 text-xs text-white"
                        : isDarkNoteTheme
                          ? "rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-100 hover:bg-slate-800"
                          : "rounded-lg border px-2 py-1 text-xs"
                    }
                    onClick={switchToDrawMode}
                  >
                    Draw
                  </button>
                </div>

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
                  onClick={() => void handleExportEditableNote()}
                >
                  Export editable note
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
            {isNoteSaved ? "Saved" : "Save Note"}
          </button>
        </div>
      </header>

      {showPagePanel && (
        <aside className={noteSidePanelClass}>
          <p className={isDarkNoteTheme ? "mb-2 text-xs font-semibold text-slate-400" : "mb-2 text-xs font-semibold text-gray-500"}>Pages</p>
          <div className="space-y-2">
            {Array.from({ length: pageCount }, (_, index) => (
              <div
                key={index}
                className="relative"
              >
                <button
                  type="button"
                  className={noteSidePageButtonClass}
                  onClick={() => scrollToPage(index)}
                >
                  <span className={isDarkNoteTheme ? "mb-1 block text-xs font-semibold text-slate-300" : "mb-1 block text-xs font-semibold text-gray-600"}>
                    Page {index + 1}
                  </span>
                  {renderPagePreview(index)}
                </button>

                <button
                  type="button"
                  className={
                    pageBookmarks.includes(index)
                      ? "absolute right-1 top-1 z-10 rounded-full bg-yellow-300 px-1.5 py-0.5 text-xs text-yellow-900 shadow"
                      : isDarkNoteTheme
                        ? "absolute right-1 top-1 z-10 rounded-full bg-slate-900/90 px-1.5 py-0.5 text-xs text-slate-200 shadow"
                        : "absolute right-1 top-1 z-10 rounded-full bg-white/90 px-1.5 py-0.5 text-xs text-gray-500 shadow"
                  }
                  title={
                    pageBookmarks.includes(index)
                      ? "Remove bookmark"
                      : "Bookmark page"
                  }
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    togglePageBookmark(index);
                  }}
                >
                  ★
                </button>

                <button
                  type="button"
                  className={
                    isDarkNoteTheme
                      ? "absolute bottom-1 left-1 z-10 rounded-md bg-slate-900/90 px-2 py-0.5 text-xs text-slate-100 shadow"
                      : "absolute bottom-1 left-1 z-10 rounded-md bg-white/90 px-2 py-0.5 text-xs text-gray-700 shadow"
                  }
                  title="Page actions"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenPageMenuIndex((current) =>
                      current === index ? null : index
                    );
                  }}
                >
                  ...
                </button>

                {openPageMenuIndex === index && (
                  <div
                    className={notePageActionMenuClass}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={notePageActionButtonClass}
                      onClick={() => addBlankPageBelow(index)}
                    >
                      Add blank page
                    </button>
                    <button
                      type="button"
                      className={notePageActionButtonClass}
                      onClick={() => cutPage(index)}
                    >
                      Cut
                    </button>
                    <button
                      type="button"
                      className={notePageActionButtonClass}
                      onClick={() => {
                        copyPageToClipboard(index);
                        setOpenPageMenuIndex(null);
                      }}
                    >
                      Copy
                    </button>
                    {hasPageClipboard && (
                      <button
                        type="button"
                        className={notePageActionButtonClass}
                        onClick={() => pastePageBelow(index)}
                      >
                        Paste below
                      </button>
                    )}
                    <button
                      type="button"
                      className={notePageActionButtonClass}
                      onClick={() => duplicatePage(index)}
                    >
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className={notePageActionButtonClass}
                      onClick={() => clearPage(index)}
                    >
                      Clear page
                    </button>
                    <button
                      type="button"
                      className={notePageActionButtonClass}
                      onClick={() => deletePage(index)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
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

              <div className="relative">
                <button
                  type="button"
                  className={
                    isObjectSelectionMode
                      ? "rounded-lg bg-blue-600 px-3 py-1 text-sm text-white"
                      : "rounded-lg border px-3 py-1 text-sm"
                  }
                  onClick={() => toggleExpandedNoteBox("select")}
                >
                  {isObjectSelectionMode
                    ? selectionTool === "lasso"
                      ? "Draw Select"
                      : "Rectangle Select"
                    : "Select Objects"}
                </button>

                {showSelectMenu && (
                  <div className="absolute left-0 top-9 z-[10001] w-52 rounded-xl border bg-white p-2 shadow-lg">
                    <button
                      type="button"
                      className={
                        isObjectSelectionMode && selectionTool === "rectangle"
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setSelectionTool("rectangle");
                        setIsObjectSelectionMode(true);
                        setIsDrawingMode(false);
                        setSelectedObjectIds([]);
                        setShowSelectMenu(false);
                      }}
                    >
                      Rectangle Select
                    </button>
                    <button
                      type="button"
                      className={
                        isObjectSelectionMode && selectionTool === "lasso"
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setSelectionTool("lasso");
                        setIsObjectSelectionMode(true);
                        setIsDrawingMode(false);
                        setSelectedObjectIds([]);
                        setShowSelectMenu(false);
                      }}
                    >
                      Draw Select
                    </button>
                    {isObjectSelectionMode && (
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setIsObjectSelectionMode(false);
                          setSelectedObjectIds([]);
                          setShowSelectMenu(false);
                        }}
                      >
                        Done Selecting
                      </button>
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
                      : "rounded-lg border px-3 py-1 text-sm"
                  }
                  onClick={() => toggleExpandedNoteBox("draw")}
                >
                  {isDrawingMode
                    ? `${activeDrawingToolLabel} ${activeDrawingThickness}px`
                    : "Draw"}
                </button>

                {showDrawMenu && (
                  <div className="absolute left-0 top-9 z-[10001] w-52 rounded-xl border bg-white p-2 shadow-lg">
                    <button
                      type="button"
                      className={
                        noteMode === "draw" && !isDrawingMode
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setNoteMode("draw");
                        setIsDrawingMode(false);
                        setIsObjectSelectionMode(false);
                        setSelectedObjectIds([]);
                        setShowDrawMenu(false);
                      }}
                    >
                      Text / Pan
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

                    <button
                      type="button"
                      className={
                        drawingTool === "highlight" && isDrawingMode
                          ? "w-full rounded-lg bg-blue-600 px-3 py-2 text-left text-sm text-white"
                          : "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-50"
                      }
                      onClick={() => {
                        setIsDrawingMode(true);
                        setDrawingTool("highlight");
                        setIsObjectSelectionMode(false);
                        setSelectedObjectIds([]);
                        setShowDrawMenu(false);
                      }}
                    >
                      Highlight
                    </button>

                    <label className="mt-2 block rounded-lg border bg-gray-50 p-3 text-xs text-gray-700">
                      {activeDrawingToolLabel} thickness: {activeDrawingThickness}px
                      <input
                        type="range"
                        min="2"
                        max={activeDrawingMaxThickness}
                        value={activeDrawingThickness}
                        className="mt-2 w-full"
                        onChange={(event) => {
                          const nextWidth = Number(event.target.value);

                          if (drawingTool === "erase") {
                            setEraserStrokeWidth(nextWidth);
                          } else if (drawingTool === "highlight") {
                            setHighlighterStrokeWidth(nextWidth);
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
          className="print-note-zoom-frame mx-auto"
          style={{
            width: pageWidth * noteZoom,
            minHeight: canvasPixelHeight * noteZoom,
          }}
        >
          <div
            ref={canvasRef}
            className="print-note-canvas relative origin-top-left"
            style={{
              minHeight: canvasMinimumHeight,
              width: canvasWidth,
              transform: `scale(${noteZoom})`,
            }}
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
                onChange={handleChangeContent}
                minimumHeight={canvasMinimumHeight}
                defaultFontFamily={data.settings.default_font_family}
                defaultFontSize={data.settings.default_font_size}
                theme={data.settings.theme}
                sharedColor={shapeColor}
                onSharedColorChange={setShapeColor}
                toolbarControls={noteObjectToolbarControls}
                onContentHeightChange={setTextContentHeight}
                pageHeight={pageHeight}
              />
            </PaperBackground>

            <NoteObjectLayer
              objects={objects}
              selectedObjectIds={selectedObjectIds}
              onSelectionChange={setSelectedObjectIds}
              onChangeObjects={handleChangeObjects}
              selectionMode={isObjectSelectionMode}
              selectionTool={selectionTool}
              drawingMode={isDrawingMode}
              drawingTool={drawingTool}
              drawingColor={shapeColor}
              drawingStrokeWidth={
                drawingTool === "erase"
                  ? eraserStrokeWidth
                  : drawingTool === "highlight"
                    ? highlighterStrokeWidth
                    : drawingStrokeWidth
              }
              theme={data.settings.theme}
              saveRequestId={saveRequestId}
              undoRequestId={drawingUndoRequestId}
              redoRequestId={drawingRedoRequestId}
              onPendingDrawingCountChange={handlePendingDrawingCountChange}
              pageWidth={pageWidth}
              pageHeight={pageHeight}
              pageCount={pageCount}
              viewScale={noteZoom}
            />
          </div>
        </div>
      </section>

      <div
        className={
          isDarkNoteTheme
            ? "no-print fixed bottom-6 right-6 z-[10001] flex w-64 items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/95 p-3 text-slate-100 shadow-lg"
            : "no-print fixed bottom-6 right-6 z-[10001] flex w-64 items-center gap-2 rounded-2xl border bg-white/95 p-3 shadow-lg"
        }
      >
        <button
          type="button"
          className={noteTopButtonClass}
          onClick={() => handleChangeNoteZoom(noteZoom - 0.1)}
          aria-label="Zoom out"
        >
          −
        </button>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <span className="whitespace-nowrap">{Math.round(noteZoom * 100)}%</span>
          <input
            type="range"
            min="60"
            max="220"
            step="5"
            value={Math.round(noteZoom * 100)}
            className="min-w-0 flex-1"
            aria-label="Note zoom"
            onChange={(event) =>
              handleChangeNoteZoom(Number(event.target.value) / 100)
            }
          />
        </label>
        <button
          type="button"
          className={noteTopButtonClass}
          onClick={() => handleChangeNoteZoom(noteZoom + 0.1)}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </main>
  );
}
