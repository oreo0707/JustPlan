"use client";

import { useEffect, useRef, useState } from "react";
import type { DrawingPoint, NoteObject, ShapeVertex } from "@/lib/types";
import { StoredImage } from "@/components/StoredImage";
import { deleteStoredImage } from "@/lib/image-storage";

type NoteObjectLayerProps = {
  objects: NoteObject[];
  selectedObjectIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onChangeObjects: (objects: NoteObject[]) => void;
  selectionMode: boolean;
  drawingMode: boolean;
  drawingTool: "draw" | "erase";
  drawingColor: string;
  drawingStrokeWidth: number;
  theme?: "light" | "dark";
  saveRequestId?: number;
  undoRequestId?: number;
  onPendingDrawingCountChange?: (count: number) => void;
  pageWidth?: number;
  pageHeight?: number;
  pageCount?: number;
};

type SelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type LayerDirection = "back" | "front";

const NOTE_FONT_FAMILIES = [
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Comic Sans MS",
];

const NOTE_FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 36];

function getLinePoints(object: NoteObject) {
  if (object.endX !== undefined && object.endY !== undefined) {
    return {
      startX: object.x,
      startY: object.y,
      endX: object.endX,
      endY: object.endY,
    };
  }

  return {
    startX: object.x,
    startY: object.y + object.height,
    endX: object.x + object.width,
    endY: object.y,
  };
}

function getObjectBounds(object: NoteObject): SelectionBox {
  if (object.type === "line") {
    const points = getLinePoints(object);
    const left = Math.min(points.startX, points.endX);
    const top = Math.min(points.startY, points.endY);

    return {
      left,
      top,
      width: Math.max(1, Math.abs(points.endX - points.startX)),
      height: Math.max(1, Math.abs(points.endY - points.startY)),
    };
  }

  return {
    left: object.x,
    top: object.y,
    width: object.width,
    height: object.height,
  };
}

function getDrawingPath(points: DrawingPoint[]) {
  if (!points.length) return "";

  return points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
    )
    .join(" ");
}

function getDistanceToSegment(
  point: DrawingPoint,
  segmentStart: DrawingPoint,
  segmentEnd: DrawingPoint
) {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentY = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return Math.hypot(point.x - segmentStart.x, point.y - segmentStart.y);
  }

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segmentStart.x) * segmentX +
        (point.y - segmentStart.y) * segmentY) /
        segmentLengthSquared
    )
  );
  const closestX = segmentStart.x + progress * segmentX;
  const closestY = segmentStart.y + progress * segmentY;

  return Math.hypot(point.x - closestX, point.y - closestY);
}

function createDrawingFromAbsolutePoints(
  source: NoteObject,
  absolutePoints: DrawingPoint[],
  id: string
) {
  const padding = Math.max(6, source.strokeWidth ?? 4);
  const xs = absolutePoints.map((point) => point.x);
  const ys = absolutePoints.map((point) => point.y);
  const left = Math.max(0, Math.min(...xs) - padding);
  const top = Math.max(0, Math.min(...ys) - padding);
  const right = Math.max(...xs) + padding;
  const bottom = Math.max(...ys) + padding;

  return {
    ...source,
    id,
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    points: absolutePoints.map((point) => ({
      x: point.x - left,
      y: point.y - top,
    })),
  };
}

function eraseDrawingAtPoint(
  object: NoteObject,
  point: DrawingPoint,
  hitRadius: number
) {
  if (object.type !== "drawing" || !object.points || object.points.length < 2) {
    return { changed: false, objects: [object] };
  }

  const absolutePoints = object.points.map((drawingPoint) => ({
    x: object.x + drawingPoint.x,
    y: object.y + drawingPoint.y,
  }));
  const erasedPoints = absolutePoints.map(
    (drawingPoint) =>
      Math.hypot(point.x - drawingPoint.x, point.y - drawingPoint.y) <=
      hitRadius
  );

  for (let index = 1; index < absolutePoints.length; index += 1) {
    if (
      getDistanceToSegment(point, absolutePoints[index - 1], absolutePoints[index]) <=
      hitRadius
    ) {
      erasedPoints[index - 1] = true;
      erasedPoints[index] = true;
    }
  }

  if (!erasedPoints.some(Boolean)) {
    return { changed: false, objects: [object] };
  }

  const keptSegments: DrawingPoint[][] = [];
  let currentSegment: DrawingPoint[] = [];

  absolutePoints.forEach((drawingPoint, index) => {
    if (erasedPoints[index]) {
      if (currentSegment.length >= 2) {
        keptSegments.push(currentSegment);
      }

      currentSegment = [];
      return;
    }

    currentSegment.push(drawingPoint);
  });

  if (currentSegment.length >= 2) {
    keptSegments.push(currentSegment);
  }

  return {
    changed: true,
    objects: keptSegments.map((segment, index) =>
      createDrawingFromAbsolutePoints(
        object,
        segment,
        index === 0 ? object.id : crypto.randomUUID()
      )
    ),
  };
}

function boxesIntersect(a: SelectionBox, b: SelectionBox) {
  return (
    a.left <= b.left + b.width &&
    a.left + a.width >= b.left &&
    a.top <= b.top + b.height &&
    a.top + a.height >= b.top
  );
}

function isVertexShape(object: NoteObject) {
  return (
    object.type === "rectangle" ||
    object.type === "circle" ||
    object.type === "triangle"
  );
}

function getShapeVertices(object: NoteObject): ShapeVertex[] {
  if (object.vertices?.length) return object.vertices;

  if (object.type === "triangle") {
    return [
      { x: object.width / 2, y: 0 },
      { x: object.width, y: object.height },
      { x: 0, y: object.height },
    ];
  }

  if (object.type === "circle") {
    return [
      { x: object.width / 2, y: 0 },
      { x: object.width, y: object.height / 2 },
      { x: object.width / 2, y: object.height },
      { x: 0, y: object.height / 2 },
    ];
  }

  return [
    { x: 0, y: 0 },
    { x: object.width, y: 0 },
    { x: object.width, y: object.height },
    { x: 0, y: object.height },
  ];
}

function getSmoothClosedPath(vertices: ShapeVertex[]) {
  if (vertices.length < 3) return "";

  const curveStrength = 0.276142;
  let path = `M ${vertices[0].x} ${vertices[0].y}`;

  vertices.forEach((point, index) => {
    const previous = vertices[(index - 1 + vertices.length) % vertices.length];
    const next = vertices[(index + 1) % vertices.length];
    const afterNext = vertices[(index + 2) % vertices.length];
    const control1 = {
      x: point.x + (next.x - previous.x) * curveStrength,
      y: point.y + (next.y - previous.y) * curveStrength,
    };
    const control2 = {
      x: next.x - (afterNext.x - point.x) * curveStrength,
      y: next.y - (afterNext.y - point.y) * curveStrength,
    };

    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
  });

  return `${path} Z`;
}

export function NoteObjectLayer({
  objects,
  selectedObjectIds,
  onSelectionChange,
  onChangeObjects,
  selectionMode,
  drawingMode,
  drawingTool,
  drawingColor,
  drawingStrokeWidth,
  theme = "light",
  saveRequestId = 0,
  undoRequestId = 0,
  onPendingDrawingCountChange,
  pageWidth = 794,
  pageHeight = 1123,
  pageCount = 1,
}: NoteObjectLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const savedTextSelectionRef = useRef<Range | null>(null);
  const lastHandledSaveRequestIdRef = useRef(0);
  const lastHandledUndoRequestIdRef = useRef(0);
  const activeDrawingPointsRef = useRef<DrawingPoint[]>([]);
  const activeDrawingFrameRef = useRef<number | null>(null);
  const pendingDrawingUndoStackRef = useRef<NoteObject[][]>([]);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [activeDrawingPoints, setActiveDrawingPoints] = useState<DrawingPoint[]>([]);
  const [eraserPoint, setEraserPoint] = useState<DrawingPoint | null>(null);
  const [pendingDrawings, setPendingDrawings] = useState<NoteObject[]>([]);
  const [openTextBoxMenuId, setOpenTextBoxMenuId] = useState<string | null>(null);
  const [openShapeMenuId, setOpenShapeMenuId] = useState<string | null>(null);
  const [shapeEditMode, setShapeEditMode] = useState<"points" | "resize">("points");
  const isDark = theme === "dark";
  const objectControlPanelClass = isDark
    ? "pointer-events-auto absolute -top-10 right-0 flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs text-slate-100 shadow-sm"
    : "pointer-events-auto absolute -top-10 right-0 flex items-center gap-1 rounded-lg border bg-white p-1 text-xs shadow-sm";
  const objectControlButtonClass = isDark
    ? "rounded-md px-2 py-1 text-slate-100 hover:bg-slate-800"
    : "rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100";
  const objectHandleClass = isDark
    ? "border-slate-500 bg-slate-900 shadow-sm"
    : "border bg-white shadow-sm";
  const textBoxMenuClass = isDark
    ? "pointer-events-auto absolute -top-7 left-24 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg"
    : "pointer-events-auto absolute -top-7 left-24 z-30 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 text-xs shadow-lg";
  const textBoxLabelClass = isDark
    ? "flex items-center gap-1 text-slate-100"
    : "flex items-center gap-1 text-gray-700";
  const drawingHeight = pageHeight * pageCount;

  function isPointInsidePaper(point: DrawingPoint) {
    return (
      point.x >= 0 &&
      point.x <= pageWidth &&
      point.y >= 0 &&
      point.y <= drawingHeight
    );
  }

  function scheduleActiveDrawingPaint() {
    if (activeDrawingFrameRef.current !== null) return;

    activeDrawingFrameRef.current = window.requestAnimationFrame(() => {
      activeDrawingFrameRef.current = null;
      setActiveDrawingPoints([...activeDrawingPointsRef.current]);
    });
  }

  useEffect(() => {
    return () => {
      if (activeDrawingFrameRef.current !== null) {
        window.cancelAnimationFrame(activeDrawingFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      saveRequestId === 0 ||
      pendingDrawings.length === 0 ||
      lastHandledSaveRequestIdRef.current === saveRequestId
    ) {
      return;
    }

    lastHandledSaveRequestIdRef.current = saveRequestId;
    onChangeObjects([...objects, ...pendingDrawings]);
    window.setTimeout(() => {
      setPendingDrawings([]);
      pendingDrawingUndoStackRef.current = [];
    }, 0);
  }, [objects, onChangeObjects, pendingDrawings, saveRequestId]);

  useEffect(() => {
    onPendingDrawingCountChange?.(pendingDrawings.length);
  }, [onPendingDrawingCountChange, pendingDrawings.length]);

  useEffect(() => {
    if (
      undoRequestId === 0 ||
      lastHandledUndoRequestIdRef.current === undoRequestId
    ) {
      return;
    }

    lastHandledUndoRequestIdRef.current = undoRequestId;

    window.setTimeout(() => {
      const previousPendingDrawings = pendingDrawingUndoStackRef.current.pop();

      if (previousPendingDrawings) {
        setPendingDrawings(previousPendingDrawings);
        return;
      }

      setPendingDrawings((current) => current.slice(0, -1));
    }, 0);
  }, [undoRequestId]);

  function pushPendingDrawingUndoSnapshot(nextSnapshot = pendingDrawings) {
    const latestSnapshot = pendingDrawingUndoStackRef.current.at(-1);

    if (JSON.stringify(latestSnapshot) === JSON.stringify(nextSnapshot)) {
      return;
    }

    pendingDrawingUndoStackRef.current = [
      ...pendingDrawingUndoStackRef.current.slice(-49),
      nextSnapshot,
    ];
  }

  function updateObject(id: string, updates: Partial<NoteObject>) {
    onChangeObjects(
      objects.map((object) =>
        object.id === id ? { ...object, ...updates } : object
      )
    );
  }

  function escapeHtml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")
      .replaceAll("\n", "<br>");
  }

  function getTextBoxEditor(id: string) {
    return document.querySelector<HTMLElement>(
      `[data-textbox-editor="${id}"]`
    );
  }

  function saveTextSelection(editor: HTMLElement) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (
      editor.contains(range.commonAncestorContainer) ||
      editor === range.commonAncestorContainer
    ) {
      savedTextSelectionRef.current = range.cloneRange();
    }
  }

  function getUsableTextSelection(editor: HTMLElement) {
    const range = savedTextSelectionRef.current;
    if (!range || range.collapsed) return null;

    if (
      !editor.contains(range.commonAncestorContainer) &&
      editor !== range.commonAncestorContainer
    ) {
      return null;
    }

    return range;
  }

  function updateTextBoxContent(id: string, editor: HTMLElement) {
    updateObject(id, {
      html: editor.innerHTML,
      text: editor.innerText,
    });
  }

  function applyTextBoxStyle(
    object: NoteObject,
    updates: Pick<NoteObject, "color" | "fontSize" | "fontFamily"> & {
      bold?: boolean;
      underline?: boolean;
    }
  ) {
    const editor = getTextBoxEditor(object.id);
    const range = editor ? getUsableTextSelection(editor) : null;
    const anchorTextToLine = (element: HTMLElement) => {
      element.style.display = "inline-block";
      element.style.lineHeight = "1";
      element.style.verticalAlign = "bottom";
    };

    if (!editor || !range) {
      if (editor) {
        editor.querySelectorAll<HTMLElement>("*").forEach((element) => {
          anchorTextToLine(element);
          if (updates.color) element.style.color = updates.color;
          if (updates.fontSize) element.style.fontSize = `${updates.fontSize}px`;
          if (updates.fontFamily) element.style.fontFamily = updates.fontFamily;
          if (updates.bold) element.style.fontWeight = "700";
          if (updates.underline) element.style.textDecoration = "underline";
        });

        if (updates.bold) editor.style.fontWeight = "700";
        if (updates.underline) editor.style.textDecoration = "underline";

        updateObject(object.id, {
          ...updates,
          html: editor.innerHTML,
          text: editor.innerText,
        });
        return;
      }

      updateObject(object.id, updates);
      return;
    }

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const span = document.createElement("span");
    anchorTextToLine(span);
    if (updates.color) span.style.color = updates.color;
    if (updates.fontSize) span.style.fontSize = `${updates.fontSize}px`;
    if (updates.fontFamily) span.style.fontFamily = updates.fontFamily;
    if (updates.bold) span.style.fontWeight = "700";
    if (updates.underline) span.style.textDecoration = "underline";

    span.appendChild(range.extractContents());
    range.insertNode(span);

    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection?.removeAllRanges();
    selection?.addRange(nextRange);
    savedTextSelectionRef.current = nextRange.cloneRange();
    updateTextBoxContent(object.id, editor);
  }

  function deleteObject(id: string) {
    const deletedObject = objects.find((object) => object.id === id);
    if (deletedObject?.type === "image" && deletedObject.src) {
      void deleteStoredImage(deletedObject.src);
    }

    onChangeObjects(objects.filter((object) => object.id !== id));
    onSelectionChange(selectedObjectIds.filter((selectedId) => selectedId !== id));
  }

  function reorderSelectedObjects(direction: LayerDirection) {
    if (selectedObjectIds.length === 0) return;

    const selectedIds = new Set(selectedObjectIds);

    if (direction === "back") {
      onChangeObjects([
        ...objects.filter((object) => selectedIds.has(object.id)),
        ...objects.filter((object) => !selectedIds.has(object.id)),
      ]);
      return;
    }

    if (direction === "front") {
      onChangeObjects([
        ...objects.filter((object) => !selectedIds.has(object.id)),
        ...objects.filter((object) => selectedIds.has(object.id)),
      ]);
      return;
    }

  }

  function renderLayerControls() {
    return (
      <div className={objectControlPanelClass}>
        {(["back", "front"] as LayerDirection[]).map(
          (direction) => (
            <button
              key={direction}
              type="button"
              className={objectControlButtonClass}
              title={
                direction === "back"
                  ? "Send to back"
                  : "Bring to front"
              }
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                reorderSelectedObjects(direction);
              }}
            >
              {direction === "back" ? "Back" : "Front"}
            </button>
          )
        )}
      </div>
    );
  }

  function startDrag(
    event: React.PointerEvent<Element>,
    draggedObject: NoteObject
  ) {
    event.preventDefault();
    event.stopPropagation();

    const canMoveAsGroup =
      draggedObject.type !== "textbox" &&
      selectedObjectIds.includes(draggedObject.id);
    const movingIds = canMoveAsGroup
      ? selectedObjectIds
      : [draggedObject.id];

    if (!canMoveAsGroup) {
      onSelectionChange([draggedObject.id]);
    }

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const originalObjects = new Map(
      objects
        .filter((object) => movingIds.includes(object.id))
        .map((object) => [object.id, object])
    );

    function handleMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - pointerX;
      const dy = moveEvent.clientY - pointerY;

      onChangeObjects(
        objects.map((object) => {
          const original = originalObjects.get(object.id);
          if (!original) return object;

          if (original.type === "line") {
            const points = getLinePoints(original);
            return {
              ...object,
              x: points.startX + dx,
              y: points.startY + dy,
              endX: points.endX + dx,
              endY: points.endY + dy,
            };
          }

          const nextY = original.y + dy;
          return {
            ...object,
            x: original.x + dx,
            y:
              original.type === "textbox"
                ? Math.round((nextY - 16) / 32) * 32 + 16
                : nextY,
          };
        })
      );
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startResize(
    event: React.PointerEvent<HTMLDivElement>,
    object: NoteObject,
    mode: "horizontal" | "vertical" | "proportional" | "free"
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange([object.id]);

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const originalWidth = object.width;
    const originalHeight = object.height;

    function handleMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - pointerX;
      const dy = moveEvent.clientY - pointerY;

      if (mode === "horizontal") {
        updateObject(object.id, {
          width: Math.max(30, originalWidth + dx),
        });
        return;
      }

      if (mode === "vertical") {
        updateObject(object.id, {
          height: Math.max(30, originalHeight + dy),
        });
        return;
      }

      if (mode === "proportional") {
        const aspectRatio =
          (object.originalWidth ?? originalWidth) /
          (object.originalHeight ?? originalHeight);
        const useHorizontalChange =
          Math.abs(dx / originalWidth) >= Math.abs(dy / originalHeight);
        let width = useHorizontalChange
          ? Math.max(30, originalWidth + dx)
          : Math.max(30, (originalHeight + dy) * aspectRatio);
        let height = width / aspectRatio;

        if (height < 30) {
          height = 30;
          width = height * aspectRatio;
        }

        updateObject(object.id, { width, height });
        return;
      }

      updateObject(object.id, {
        width: Math.max(30, originalWidth + dx),
        height: Math.max(30, originalHeight + dy),
      });
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startErasing(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;
    const erasingElement = event.currentTarget;
    const pointerId = event.pointerId;
    let workingObjects = objects;
    let workingPendingDrawings = pendingDrawings;
    const eraserRadius = Math.max(2, drawingStrokeWidth / 2);
    let pendingUndoSnapshotCaptured = false;

    const getPoint = (pointerEvent: PointerEvent | React.PointerEvent) => ({
      x: pointerEvent.clientX - layerBounds.left,
      y: pointerEvent.clientY - layerBounds.top,
    });

    function eraseAt(point: DrawingPoint) {
      if (!isPointInsidePaper(point)) return;

      setEraserPoint(point);

      let savedChanged = false;
      let pendingChanged = false;
      const nextObjects = workingObjects.flatMap((object) => {
        if (object.type !== "drawing") return [object];

        const result = eraseDrawingAtPoint(object, point, eraserRadius);
        if (result.changed) savedChanged = true;

        return result.objects;
      });
      const nextPendingDrawings = workingPendingDrawings.flatMap((object) => {
        const result = eraseDrawingAtPoint(object, point, eraserRadius);
        if (result.changed) pendingChanged = true;

        return result.objects;
      });

      if (savedChanged) {
        workingObjects = nextObjects;
        onChangeObjects(nextObjects);
      }

      if (pendingChanged) {
        if (!pendingUndoSnapshotCaptured) {
          pushPendingDrawingUndoSnapshot(workingPendingDrawings);
          pendingUndoSnapshotCaptured = true;
        }

        workingPendingDrawings = nextPendingDrawings;
        setPendingDrawings(nextPendingDrawings);
      }

      if (savedChanged || pendingChanged) {
        onSelectionChange([]);
      }
    }

    eraseAt(getPoint(event));

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;

      moveEvent.preventDefault();

      const moveEvents =
        typeof moveEvent.getCoalescedEvents === "function"
          ? moveEvent.getCoalescedEvents()
          : [moveEvent];

      moveEvents.forEach((pointerEvent) => eraseAt(getPoint(pointerEvent)));
    }

    function finishErasing(finishEvent: PointerEvent) {
      if (finishEvent.pointerId !== pointerId) return;

      finishEvent.preventDefault();
      erasingElement.removeEventListener("pointermove", handleMove);
      erasingElement.removeEventListener("pointerup", finishErasing);
      erasingElement.removeEventListener("pointercancel", finishErasing);
      erasingElement.removeEventListener("lostpointercapture", finishErasing);
      setEraserPoint(null);

      if (erasingElement.hasPointerCapture(pointerId)) {
        erasingElement.releasePointerCapture(pointerId);
      }
    }

    erasingElement.addEventListener("pointermove", handleMove, { passive: false });
    erasingElement.addEventListener("pointerup", finishErasing);
    erasingElement.addEventListener("pointercancel", finishErasing);
    erasingElement.addEventListener("lostpointercapture", finishErasing);
  }

  function startDrawing(event: PointerEvent | React.PointerEvent<HTMLDivElement>) {
    if (!drawingMode) return;

    event.preventDefault();
    event.stopPropagation();

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;
    const pointerId = event.pointerId;

    const getPoint = (pointerEvent: PointerEvent | React.PointerEvent) => ({
      x: pointerEvent.clientX - layerBounds.left,
      y: pointerEvent.clientY - layerBounds.top,
    });

    const firstPoint = getPoint(event);
    if (!isPointInsidePaper(firstPoint)) {
      return;
    }

    const minPointDistance = event.pointerType === "pen" ? 0.35 : 1;
    activeDrawingPointsRef.current = [firstPoint];
    setActiveDrawingPoints([firstPoint]);
    onSelectionChange([]);

    function addPoint(nextPoint: DrawingPoint) {
      if (!isPointInsidePaper(nextPoint)) return;

      const points = activeDrawingPointsRef.current;
      const lastPoint = points[points.length - 1];
      const distance = Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y);

      if (distance < minPointDistance) return;

      points.push(nextPoint);
    }

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;

      moveEvent.preventDefault();

      const moveEvents =
        typeof moveEvent.getCoalescedEvents === "function"
          ? moveEvent.getCoalescedEvents()
          : [moveEvent];

      moveEvents.forEach((pointerEvent) => addPoint(getPoint(pointerEvent)));
      scheduleActiveDrawingPaint();
    }

    function handleRawUpdate(rawEvent: Event) {
      handleMove(rawEvent as PointerEvent);
    }

    function finishDrawing(finishEvent: PointerEvent) {
      if (finishEvent.pointerId !== pointerId) return;

      finishEvent.preventDefault();
      if (activeDrawingFrameRef.current !== null) {
        window.cancelAnimationFrame(activeDrawingFrameRef.current);
        activeDrawingFrameRef.current = null;
      }

      const finalPoints = [...activeDrawingPointsRef.current];
      activeDrawingPointsRef.current = [];
      setActiveDrawingPoints([]);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerrawupdate", handleRawUpdate);
      window.removeEventListener("pointerup", finishDrawing);
      window.removeEventListener("pointercancel", finishDrawing);

      if (finalPoints.length < 2) return;

      const padding = Math.max(6, drawingStrokeWidth);
      const xs = finalPoints.map((point) => point.x);
      const ys = finalPoints.map((point) => point.y);
      const left = Math.max(0, Math.min(...xs) - padding);
      const top = Math.max(0, Math.min(...ys) - padding);
      const right = Math.max(...xs) + padding;
      const bottom = Math.max(...ys) + padding;

      const newDrawing: NoteObject = {
        id: crypto.randomUUID(),
        type: "drawing",
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
        points: finalPoints.map((point) => ({
          x: point.x - left,
          y: point.y - top,
        })),
        color: drawingColor,
        strokeWidth: drawingStrokeWidth,
        flipX: false,
        flipY: false,
      };

      pushPendingDrawingUndoSnapshot();
      setPendingDrawings((current) => [...current, newDrawing]);
      onSelectionChange([]);
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerrawupdate", handleRawUpdate, { passive: false });
    window.addEventListener("pointerup", finishDrawing);
    window.addEventListener("pointercancel", finishDrawing);
  }

  useEffect(() => {
    if (!drawingMode || drawingTool === "erase") return;

    const drawingLayer = layerRef.current;
    if (!drawingLayer) return;

    function handleNativePointerDown(event: PointerEvent) {
      startDrawing(event);
    }

    drawingLayer.addEventListener("pointerdown", handleNativePointerDown, {
      passive: false,
    });

    return () => {
      drawingLayer.removeEventListener("pointerdown", handleNativePointerDown);
    };
  });

  function startLineEndpointDrag(
    event: React.PointerEvent<HTMLDivElement>,
    object: NoteObject,
    endpoint: "start" | "end"
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange([object.id]);

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const points = getLinePoints(object);

    function handleMove(moveEvent: PointerEvent) {
      const dx = moveEvent.clientX - pointerX;
      const dy = moveEvent.clientY - pointerY;

      updateObject(
        object.id,
        endpoint === "start"
          ? {
              x: points.startX + dx,
              y: points.startY + dy,
              endX: points.endX,
              endY: points.endY,
            }
          : {
              x: points.startX,
              y: points.startY,
              endX: points.endX + dx,
              endY: points.endY + dy,
            }
      );
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startVertexDrag(
    event: React.PointerEvent<HTMLDivElement>,
    object: NoteObject,
    vertexIndex: number
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange([object.id]);

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const absoluteVertices = getShapeVertices(object).map((vertex) => ({
      x: object.x + (object.flipX ? object.width - vertex.x : vertex.x),
      y: object.y + (object.flipY ? object.height - vertex.y : vertex.y),
    }));

    function handleMove(moveEvent: PointerEvent) {
      const movedVertices = absoluteVertices.map((vertex, index) =>
        index === vertexIndex
          ? {
              x: vertex.x + moveEvent.clientX - pointerX,
              y: vertex.y + moveEvent.clientY - pointerY,
            }
          : vertex
      );
      const xs = movedVertices.map((vertex) => vertex.x);
      const ys = movedVertices.map((vertex) => vertex.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      const right = Math.max(...xs);
      const bottom = Math.max(...ys);

      updateObject(object.id, {
        x: left,
        y: top,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
        vertices: movedVertices.map((vertex) => ({
          x: vertex.x - left,
          y: vertex.y - top,
        })),
        flipX: false,
        flipY: false,
      });
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startSelectionBox(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectionMode || drawingMode || event.target !== event.currentTarget) return;

    event.preventDefault();
    event.stopPropagation();

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;

    const layerLeft = layerBounds.left;
    const layerTop = layerBounds.top;
    const startX = event.clientX - layerLeft;
    const startY = event.clientY - layerTop;
    onSelectionChange([]);

    function handleMove(moveEvent: PointerEvent) {
      const currentX = moveEvent.clientX - layerLeft;
      const currentY = moveEvent.clientY - layerTop;
      const box = {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
      };

      setSelectionBox(box);
      onSelectionChange(
        objects
          .filter((object) => boxesIntersect(box, getObjectBounds(object)))
          .map((object) => object.id)
      );
    }

    function handleUp() {
      setSelectionBox(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  const hasSingleSelection = selectedObjectIds.length === 1;

  return (
    <div
      ref={layerRef}
      className={
        selectionMode || drawingMode
          ? `pointer-events-auto absolute inset-0 z-20 touch-none select-none ${
              drawingMode && drawingTool === "erase"
                ? "cursor-cell"
                : "cursor-crosshair"
            }`
          : "pointer-events-none absolute inset-0 z-20"
      }
      style={{
        touchAction: drawingMode || selectionMode ? "none" : "auto",
        WebkitUserSelect: drawingMode || selectionMode ? "none" : undefined,
        userSelect: drawingMode || selectionMode ? "none" : undefined,
        WebkitTouchCallout: drawingMode || selectionMode ? "none" : undefined,
        overscrollBehavior: drawingMode || selectionMode ? "none" : undefined,
      }}
      onPointerDown={(event) => {
        if (drawingMode) {
          if (drawingTool === "erase") {
            startErasing(event);
          }
          return;
        }

        startSelectionBox(event);
      }}
    >
      {drawingMode && drawingTool === "erase" && eraserPoint && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-blue-500 bg-blue-400/15"
          style={{
            left: eraserPoint.x - drawingStrokeWidth / 2,
            top: eraserPoint.y - drawingStrokeWidth / 2,
            width: drawingStrokeWidth,
            height: drawingStrokeWidth,
          }}
        />
      )}

      {activeDrawingPoints.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <path
            d={getDrawingPath(activeDrawingPoints)}
            fill="none"
            stroke={drawingColor}
            strokeWidth={drawingStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {pendingDrawings.map((object) => (
        <div
          key={object.id}
          className="pointer-events-none absolute"
          style={{
            left: object.x,
            top: object.y,
            width: object.width,
            height: object.height,
          }}
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
            preserveAspectRatio="none"
            className="overflow-visible"
          >
            <path
              d={getDrawingPath(object.points ?? [])}
              fill="none"
              stroke={object.color ?? "#111827"}
              strokeWidth={object.strokeWidth ?? 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      ))}

      {objects.map((object) => {
        const selected = !drawingMode && selectedObjectIds.includes(object.id);

        if (object.type === "line") {
          const points = getLinePoints(object);

          return (
            <div key={object.id} className="pointer-events-none absolute inset-0">
              <svg className="absolute inset-0 h-full w-full overflow-visible">
                {selected && (
                  <line
                    x1={points.startX}
                    y1={points.startY}
                    x2={points.endX}
                    y2={points.endY}
                    stroke="#2563eb"
                    strokeWidth="11"
                    strokeLinecap="round"
                    opacity="0.35"
                  />
                )}
                <line
                  x1={points.startX}
                  y1={points.startY}
                  x2={points.endX}
                  y2={points.endY}
                  stroke={object.color ?? "#111827"}
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <line
                  x1={points.startX}
                  y1={points.startY}
                  x2={points.endX}
                  y2={points.endY}
                  stroke="transparent"
                  strokeWidth="20"
                  className="pointer-events-auto cursor-move"
                  onPointerDown={(event) => startDrag(event, object)}
                />
              </svg>

              {selected && hasSingleSelection && (
                <>
                  <div
                    className="absolute"
                    style={{ left: points.startX, top: points.startY }}
                  >
                    {renderLayerControls()}
                  </div>
                  <div
                    className={`pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                    style={{ left: points.startX, top: points.startY }}
                    onPointerDown={(event) =>
                      startLineEndpointDrag(event, object, "start")
                    }
                  />
                  <div
                    className={`pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                    style={{ left: points.endX, top: points.endY }}
                    onPointerDown={(event) =>
                      startLineEndpointDrag(event, object, "end")
                    }
                  />
                  <button
                    type="button"
                    className="pointer-events-auto absolute -translate-y-full rounded-full bg-red-500 px-2 text-xs text-white"
                    style={{ left: points.endX + 12, top: points.endY - 8 }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      deleteObject(object.id);
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        }

        const ignoreDuringDrawing = drawingMode;
        const shapeVertices = isVertexShape(object)
          ? getShapeVertices(object)
          : [];

        return (
          <div
            key={object.id}
            className={`${
              ignoreDuringDrawing
                ? "pointer-events-none"
                : "pointer-events-auto"
            } absolute cursor-move ${
              selected
                ? "ring-2 ring-blue-600 ring-offset-2 ring-offset-transparent"
                : ""
            }`}
            style={{
              left: object.x,
              top: object.y,
              width: object.width,
              height: object.height,
              transform: `scale(${object.flipX ? -1 : 1}, ${
                object.flipY ? -1 : 1
              })`,
            }}
            onPointerDown={(event) => {
              if (object.type === "textbox") {
                event.stopPropagation();
                onSelectionChange([object.id]);
                return;
              }

              startDrag(event, object);
            }}
          >
            {object.type === "textbox" && (
              <div className="relative h-full w-full">
                {selected && hasSingleSelection && (
                  <>
                    <div
                      className="absolute -top-7 left-0 rounded-md bg-black px-2 py-1 text-xs text-white"
                      onPointerDown={(event) => startDrag(event, object)}
                    >
                      Move
                    </div>

                    <button
                      type="button"
                      className={
                        isDark
                          ? "absolute -top-7 left-14 rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-sm ring-1 ring-slate-700"
                          : "absolute -top-7 left-14 rounded-md bg-white px-2 py-1 text-xs text-gray-700 shadow-sm ring-1 ring-gray-200"
                      }
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenTextBoxMenuId((current) =>
                          current === object.id ? null : object.id
                        );
                      }}
                    >
                      ...
                    </button>

                    {openTextBoxMenuId === object.id && (
                      <div
                        className={textBoxMenuClass}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <label className={textBoxLabelClass}>
                          Color
                          <input
                            type="color"
                            value={object.color ?? "#111827"}
                            className="h-7 w-9 rounded border"
                            onChange={(event) =>
                              applyTextBoxStyle(object, {
                                color: event.target.value,
                              })
                            }
                          />
                        </label>

                        <button
                          type="button"
                          className="rounded border px-2 py-1 font-bold"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            applyTextBoxStyle(object, { bold: true });
                          }}
                        >
                          B
                        </button>

                        <button
                          type="button"
                          className="rounded border px-2 py-1 underline"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            applyTextBoxStyle(object, { underline: true });
                          }}
                        >
                          U
                        </button>

                        <label className={textBoxLabelClass}>
                          Size
                          <select
                            value={object.fontSize ?? 16}
                            className={isDark ? "rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100" : "rounded border px-2 py-1"}
                            onChange={(event) =>
                              applyTextBoxStyle(object, {
                                fontSize: Number(event.target.value),
                              })
                            }
                          >
                            {NOTE_FONT_SIZES.map((fontSize) => (
                              <option key={fontSize} value={fontSize}>
                                {fontSize}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className={textBoxLabelClass}>
                          Font
                          <select
                            value={object.fontFamily ?? "Arial"}
                            className={isDark ? "rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100" : "rounded border px-2 py-1"}
                            onChange={(event) =>
                              applyTextBoxStyle(object, {
                                fontFamily: event.target.value,
                              })
                            }
                          >
                            {NOTE_FONT_FAMILIES.map((fontFamily) => (
                              <option key={fontFamily} value={fontFamily}>
                                {fontFamily}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </>
                )}
                <div
                  data-textbox-editor={object.id}
                  contentEditable
                  suppressContentEditableWarning
                  className="h-full w-full overflow-auto whitespace-pre-wrap border-none bg-transparent p-0 text-gray-950 outline-none empty:before:text-gray-400 empty:before:content-['Type_here...'] [&_span]:inline-block [&_span]:align-bottom [&_span]:leading-none [&_*]:align-bottom"
                  style={{
                    color: object.color ?? (isDark ? "#f8fafc" : "#111827"),
                    fontSize: `${object.fontSize ?? 16}px`,
                    fontFamily: object.fontFamily ?? "Arial",
                    lineHeight: "32px",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: object.html ?? escapeHtml(object.text ?? ""),
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectionChange([object.id]);
                  }}
                  onMouseUp={(event) => saveTextSelection(event.currentTarget)}
                  onKeyUp={(event) => saveTextSelection(event.currentTarget)}
                  onInput={(event) =>
                    updateTextBoxContent(object.id, event.currentTarget)
                  }
                  onPaste={(event) => {
                    event.preventDefault();
                    const text = event.clipboardData.getData("text/plain");
                    document.execCommand("insertText", false, text);
                    updateTextBoxContent(object.id, event.currentTarget);
                  }}
                />
              </div>
            )}

            {object.type === "sticker" && object.src && (
              <img
                src={object.src}
                alt="Sticker"
                className="h-full w-full object-fill"
                draggable={false}
              />
            )}

            {object.type === "image" && object.src && (
              <StoredImage
                src={object.src}
                alt="Uploaded image"
                className="h-full w-full object-fill"
              />
            )}

            {object.type === "rectangle" && (
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
                preserveAspectRatio="none"
                className="overflow-visible"
              >
                <polygon
                  points={shapeVertices
                    .map((vertex) => `${vertex.x},${vertex.y}`)
                    .join(" ")}
                  fill={object.filled ? object.color ?? "#111827" : "transparent"}
                  stroke={object.color ?? "#111827"}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            {object.type === "circle" && (
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
                preserveAspectRatio="none"
                className="overflow-visible"
              >
                <path
                  d={getSmoothClosedPath(shapeVertices)}
                  fill={object.filled ? object.color ?? "#111827" : "transparent"}
                  stroke={object.color ?? "#111827"}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            {object.type === "triangle" && (
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
                preserveAspectRatio="none"
                className="overflow-visible"
              >
                <polygon
                  points={shapeVertices
                    .map((vertex) => `${vertex.x},${vertex.y}`)
                    .join(" ")}
                  fill={object.filled ? object.color ?? "#111827" : "transparent"}
                  stroke={object.color ?? "#111827"}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
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
                  d={getDrawingPath(object.points ?? [])}
                  fill="none"
                  stroke={object.color ?? "#111827"}
                  strokeWidth={object.strokeWidth ?? 4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            )}

            {selected && hasSingleSelection && isVertexShape(object) && (
              <>
                <button
                  type="button"
                  className={
                    isDark
                      ? "pointer-events-auto absolute -top-7 left-0 rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-sm ring-1 ring-slate-700"
                      : "pointer-events-auto absolute -top-7 left-0 rounded-md bg-white px-2 py-1 text-xs text-gray-700 shadow-sm ring-1 ring-gray-200"
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpenShapeMenuId((current) =>
                      current === object.id ? null : object.id
                    );
                  }}
                >
                  ...
                </button>

                {openShapeMenuId === object.id && (
                  <div
                    className={
                      isDark
                        ? "pointer-events-auto absolute -top-7 left-12 z-30 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg"
                        : "pointer-events-auto absolute -top-7 left-12 z-30 flex items-center gap-2 rounded-lg border bg-white p-2 text-xs shadow-lg"
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={
                        shapeEditMode === "points"
                          ? "rounded bg-blue-600 px-2 py-1 text-white"
                          : objectControlButtonClass
                      }
                      onClick={() => setShapeEditMode("points")}
                    >
                      Points
                    </button>
                    <button
                      type="button"
                      className={
                        shapeEditMode === "resize"
                          ? "rounded bg-blue-600 px-2 py-1 text-white"
                          : objectControlButtonClass
                      }
                      onClick={() => setShapeEditMode("resize")}
                    >
                      Resize
                    </button>
                  </div>
                )}
              </>
            )}

            {selected && hasSingleSelection && isVertexShape(object) && shapeEditMode === "points" &&
              shapeVertices.map((vertex, index) => (
                <div
                  key={`${object.id}-vertex-${index}`}
                  className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                  style={{ left: vertex.x, top: vertex.y }}
                  onPointerDown={(event) =>
                    startVertexDrag(event, object, index)
                  }
                />
              ))}

            {selected && hasSingleSelection && (
              <>
                {renderLayerControls()}

                {(object.type === "image" || object.type === "sticker") && (
                  <>
                    <div
                      className={`absolute -right-2 top-1/2 h-7 w-3 -translate-y-1/2 cursor-ew-resize rounded-full ${objectHandleClass}`}
                      title="Resize width"
                      onPointerDown={(event) =>
                        startResize(event, object, "horizontal")
                      }
                    />
                    <div
                      className={`absolute -bottom-2 left-1/2 h-3 w-7 -translate-x-1/2 cursor-ns-resize rounded-full ${objectHandleClass}`}
                      title="Resize height"
                      onPointerDown={(event) =>
                        startResize(event, object, "vertical")
                      }
                    />
                    <div
                      className={`absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                      title="Scale proportionally"
                      onPointerDown={(event) =>
                        startResize(event, object, "proportional")
                      }
                    />
                  </>
                )}
                {isVertexShape(object) && shapeEditMode === "resize" && (
                  <div
                    className={`absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                    title="Resize proportionally"
                    onPointerDown={(event) =>
                      startResize(event, object, "proportional")
                    }
                  />
                )}
                {!isVertexShape(object) &&
                  object.type !== "image" &&
                  object.type !== "sticker" && (
                  <div
                    className={`absolute -right-2 -bottom-2 h-4 w-4 cursor-se-resize rounded-full ${objectHandleClass}`}
                    onPointerDown={(event) =>
                      startResize(event, object, "free")
                    }
                  />
                )}
                <button
                  type="button"
                  className="absolute -right-3 -top-3 rounded-full bg-red-500 px-2 text-xs text-white"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteObject(object.id);
                  }}
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}

      {selectionBox && (
        <div
          className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/15"
          style={selectionBox}
        />
      )}
    </div>
  );
}
