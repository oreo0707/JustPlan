"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawingPoint, NoteObject, ShapeVertex } from "@/lib/types";
import { StoredImage } from "@/components/StoredImage";
import { deleteStoredImage } from "@/lib/image-storage";

type NoteObjectLayerProps = {
  objects: NoteObject[];
  selectedObjectIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onChangeObjects: (objects: NoteObject[]) => void;
  selectionMode: boolean;
  selectionTool?: "rectangle" | "lasso";
  drawingMode: boolean;
  drawingTool: "draw" | "erase" | "highlight";
  drawingColor: string;
  drawingStrokeWidth: number;
  theme?: "light" | "dark";
  saveRequestId?: number;
  undoRequestId?: number;
  redoRequestId?: number;
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

type ActiveEraserStroke = {
  eraseAt: (point: DrawingPoint) => void;
  finish: () => void;
};

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

function isPointInBox(point: DrawingPoint, box: SelectionBox) {
  return (
    point.x >= box.left &&
    point.x <= box.left + box.width &&
    point.y >= box.top &&
    point.y <= box.top + box.height
  );
}

function isPointInPolygon(point: DrawingPoint, polygon: DrawingPoint[]) {
  if (polygon.length < 3) return false;

  let inside = false;

  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const crossesY =
      current.y > point.y !== previous.y > point.y;

    if (!crossesY) continue;

    const intersectionX =
      ((previous.x - current.x) * (point.y - current.y)) /
        (previous.y - current.y) +
      current.x;

    if (point.x < intersectionX) inside = !inside;
  }

  return inside;
}

function doesPolygonSelectBox(polygon: DrawingPoint[], box: SelectionBox) {
  if (polygon.length < 3) return false;

  const boxPoints = [
    { x: box.left, y: box.top },
    { x: box.left + box.width, y: box.top },
    { x: box.left, y: box.top + box.height },
    { x: box.left + box.width, y: box.top + box.height },
    { x: box.left + box.width / 2, y: box.top + box.height / 2 },
  ];

  return (
    boxPoints.some((point) => isPointInPolygon(point, polygon)) ||
    polygon.some((point) => isPointInBox(point, box))
  );
}

function isVertexShape(object: NoteObject) {
  return (
    object.type === "rectangle" ||
    object.type === "circle" ||
    object.type === "triangle"
  );
}

function canDuplicateObject(object: NoteObject) {
  return (
    isVertexShape(object) ||
    object.type === "line" ||
    object.type === "image" ||
    object.type === "sticker" ||
    object.type === "textbox"
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
  selectionTool = "rectangle",
  drawingMode,
  drawingTool,
  drawingColor,
  drawingStrokeWidth,
  theme = "light",
  saveRequestId = 0,
  undoRequestId = 0,
  redoRequestId = 0,
  onPendingDrawingCountChange,
  pageWidth = 794,
  pageHeight = 1123,
  pageCount = 1,
}: NoteObjectLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const savedTextSelectionRef = useRef<Range | null>(null);
  const liveDrawingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastHandledSaveRequestIdRef = useRef(0);
  const lastHandledUndoRequestIdRef = useRef(0);
  const lastHandledRedoRequestIdRef = useRef(0);
  const activeDrawingPointsRef = useRef<DrawingPoint[]>([]);
  const activeDrawingFrameRef = useRef<number | null>(null);
  const pendingDrawingUndoStackRef = useRef<NoteObject[][]>([]);
  const pendingDrawingRedoStackRef = useRef<NoteObject[][]>([]);
  const tabletGestureRef = useRef<{
    touchCount: 2 | 3;
    startTime: number;
    startX: number;
    startY: number;
    maxDistance: number;
  } | null>(null);
  const activeDrawingPointerIdRef = useRef<number | null>(null);
  const activeDrawingBoundsRef = useRef<DOMRect | null>(null);
  const activeDrawingMinDistanceRef = useRef(1);
  const suppressPointerDrawingUntilRef = useRef(0);
  const canvasDrawingTouchIdRef = useRef<number | null>(null);
  const canvasDrawingPointerIdRef = useRef<number | null>(null);
  const eraserTouchIdRef = useRef<number | null>(null);
  const activeEraserStrokeRef = useRef<ActiveEraserStroke | null>(null);
  const documentScrollLockRef = useRef<{
    bodyOverflow: string;
    bodyTouchAction: string;
    htmlOverflow: string;
    htmlTouchAction: string;
  } | null>(null);
  const drawingModeRef = useRef(drawingMode);
  const drawingToolRef = useRef(drawingTool);
  const drawingColorRef = useRef(drawingColor);
  const drawingStrokeWidthRef = useRef(drawingStrokeWidth);
  const objectsRef = useRef(objects);
  const onChangeObjectsRef = useRef(onChangeObjects);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const beginEraserStrokeRef = useRef<
    ((initialPoint: DrawingPoint) => ActiveEraserStroke) | null
  >(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const [selectionPath, setSelectionPath] = useState<DrawingPoint[]>([]);
  const [activeDrawingPoints, setActiveDrawingPoints] = useState<DrawingPoint[]>([]);
  const [eraserPoint, setEraserPoint] = useState<DrawingPoint | null>(null);
  const [isEraserScrollLocked, setIsEraserScrollLocked] = useState(false);
  const [pendingDrawings, setPendingDrawings] = useState<NoteObject[]>([]);
  const pendingDrawingsRef = useRef<NoteObject[]>([]);
  const [objectClipboard, setObjectClipboard] = useState<NoteObject[]>([]);
  const [objectClipboardAnchor, setObjectClipboardAnchor] =
    useState<DrawingPoint | null>(null);
  const [openTextBoxMenuId, setOpenTextBoxMenuId] = useState<string | null>(null);
  const [openShapeMenuId, setOpenShapeMenuId] = useState<string | null>(null);
  const [shapeEditMode, setShapeEditMode] = useState<"points" | "resize">("points");
  const isDark = theme === "dark";
  const objectControlPanelClass = isDark
    ? "pointer-events-auto absolute -bottom-48 left-0 z-50 flex flex-col items-stretch gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs text-slate-100 shadow-sm"
    : "pointer-events-auto absolute -bottom-48 left-0 z-50 flex flex-col items-stretch gap-1 rounded-lg border bg-white p-1 text-xs shadow-sm";
  const objectControlButtonClass = isDark
    ? "rounded-md px-2 py-1 text-slate-100 hover:bg-slate-800"
    : "rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100";
  const selectionActionPanelClass = isDark
    ? "pointer-events-auto absolute z-50 flex flex-col items-stretch gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 text-xs text-slate-100 shadow-sm"
    : "pointer-events-auto absolute z-50 flex flex-col items-stretch gap-1 rounded-lg border bg-white p-1 text-xs shadow-sm";
  const objectHandleClass = isDark
    ? "border-slate-500 bg-slate-900 shadow-sm"
    : "border bg-white shadow-sm";
  const textBoxMenuClass = isDark
    ? "pointer-events-auto absolute -top-7 left-24 z-50 flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg"
    : "pointer-events-auto absolute -top-7 left-24 z-50 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 text-xs shadow-lg";
  const textBoxLabelClass = isDark
    ? "flex items-center gap-1 text-slate-100"
    : "flex items-center gap-1 text-gray-700";
  const drawingHeight = pageHeight * pageCount;

  function clampValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function clampPosition(x: number, y: number, width: number, height: number) {
    return {
      x: clampValue(x, 0, Math.max(0, pageWidth - width)),
      y: clampValue(y, 0, Math.max(0, drawingHeight - height)),
    };
  }

  function clampMoveDelta(bounds: SelectionBox, dx: number, dy: number) {
    return {
      dx: clampValue(dx, -bounds.left, pageWidth - (bounds.left + bounds.width)),
      dy: clampValue(dy, -bounds.top, drawingHeight - (bounds.top + bounds.height)),
    };
  }

  function clampSizeForObject(
    object: NoteObject,
    width: number,
    height: number
  ) {
    return {
      width: Math.min(Math.max(1, width), Math.max(1, pageWidth - object.x)),
      height: Math.min(Math.max(1, height), Math.max(1, drawingHeight - object.y)),
    };
  }

  function isStylusTouch(touch: Touch) {
    return (touch as Touch & { touchType?: string }).touchType === "stylus";
  }

  function canUsePointerForDrawing(event: PointerEvent | React.PointerEvent) {
    return event.pointerType !== "touch";
  }

  const lockDocumentScrollForEraserStroke = useCallback(() => {
    if (typeof document === "undefined" || documentScrollLockRef.current) {
      return;
    }

    documentScrollLockRef.current = {
      bodyOverflow: document.body.style.overflow,
      bodyTouchAction: document.body.style.touchAction,
      htmlOverflow: document.documentElement.style.overflow,
      htmlTouchAction: document.documentElement.style.touchAction,
    };

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.touchAction = "none";
  }, []);

  const unlockDocumentScrollForEraserStroke = useCallback(() => {
    if (typeof document === "undefined" || !documentScrollLockRef.current) {
      return;
    }

    document.body.style.overflow =
      documentScrollLockRef.current.bodyOverflow;
    document.body.style.touchAction =
      documentScrollLockRef.current.bodyTouchAction;
    document.documentElement.style.overflow =
      documentScrollLockRef.current.htmlOverflow;
    document.documentElement.style.touchAction =
      documentScrollLockRef.current.htmlTouchAction;

    documentScrollLockRef.current = null;
  }, []);

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

  function prepareLiveDrawingCanvas() {
    const canvas = liveDrawingCanvasRef.current;
    if (!canvas) return null;

    const pixelRatio = window.devicePixelRatio || 1;
    const targetWidth = Math.round(pageWidth * pixelRatio);
    const targetHeight = Math.round(drawingHeight * pixelRatio);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${pageWidth}px`;
      canvas.style.height = `${drawingHeight}px`;
    }

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    if (drawingToolRef.current === "highlight") {
      context.strokeStyle = drawingColorRef.current;
      context.globalAlpha = 0.45;
      context.lineWidth = drawingStrokeWidthRef.current;
      context.globalCompositeOperation = "multiply";
    } else {
      context.strokeStyle = drawingColorRef.current;
      context.globalAlpha = 1;
      context.lineWidth = drawingStrokeWidthRef.current;
      context.globalCompositeOperation = "source-over";
    }

    return context;
  }

  function clearLiveDrawingCanvas() {
    const canvas = liveDrawingCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  function undoPendingDrawingStroke() {
    const previousSnapshot = pendingDrawingUndoStackRef.current.pop();

    if (!previousSnapshot) {
      return;
    }

    pendingDrawingRedoStackRef.current = [
      ...pendingDrawingRedoStackRef.current.slice(-49),
      cloneDrawingSnapshot(pendingDrawingsRef.current),
    ];

    replacePendingDrawings(previousSnapshot);
  }

  function redoPendingDrawingStroke() {
    const nextSnapshot = pendingDrawingRedoStackRef.current.pop();

    if (!nextSnapshot) {
      return;
    }

    pushPendingDrawingUndoSnapshot(pendingDrawingsRef.current);
    replacePendingDrawings(nextSnapshot);
  }
  
  function cloneDrawingSnapshot(drawings: NoteObject[]) {
    return structuredClone(drawings) as NoteObject[];
  }

  function replacePendingDrawings(nextDrawings: NoteObject[]) {
    pendingDrawingsRef.current = nextDrawings;
    setPendingDrawings(nextDrawings);
  }

  function commitDrawingPoints(finalPoints: DrawingPoint[]) {
    if (finalPoints.length < 2) {
      clearLiveDrawingCanvas();
      return;
    }

    const strokeWidth = drawingStrokeWidthRef.current;
    const padding = Math.max(6, strokeWidth);
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
      color: drawingColorRef.current,
      drawingTool:
        drawingToolRef.current === "highlight" ? "highlight" : "draw",
      strokeWidth,
      flipX: false,
      flipY: false,
    };

    const currentPendingDrawings = pendingDrawingsRef.current;
    const nextPendingDrawings = [...currentPendingDrawings, newDrawing];

    pushPendingDrawingUndoSnapshot(currentPendingDrawings);
    pendingDrawingRedoStackRef.current = [];
    replacePendingDrawings(nextPendingDrawings);

    onSelectionChange([]);
    clearLiveDrawingCanvas();
  }

  function isDrawingPointer(event: PointerEvent | React.PointerEvent) {
    return event.pointerType === "pen" || event.pointerType === "mouse";
  }

  function addLiveCanvasPoint(nextPoint: DrawingPoint) {
    if (!isPointInsidePaper(nextPoint)) return;

    const context = prepareLiveDrawingCanvas();
    if (!context) return;

    const points = activeDrawingPointsRef.current;
    const previousPoint = points[points.length - 1];

    if (!previousPoint) {
      points.push(nextPoint);
      context.beginPath();
      context.moveTo(nextPoint.x, nextPoint.y);
      context.lineTo(nextPoint.x + 0.01, nextPoint.y + 0.01);
      context.stroke();
      return;
    }

    const distance = Math.hypot(
      nextPoint.x - previousPoint.x,
      nextPoint.y - previousPoint.y
    );

    if (distance < activeDrawingMinDistanceRef.current) return;

    points.push(nextPoint);
    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
  }

  useEffect(() => {
    return () => {
      if (activeDrawingFrameRef.current !== null) {
        window.cancelAnimationFrame(activeDrawingFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    drawingModeRef.current = drawingMode;
    drawingToolRef.current = drawingTool;
    drawingColorRef.current = drawingColor;
    drawingStrokeWidthRef.current = drawingStrokeWidth;
    objectsRef.current = objects;
    onChangeObjectsRef.current = onChangeObjects;
    onSelectionChangeRef.current = onSelectionChange;
  }, [
    drawingColor,
    drawingMode,
    drawingStrokeWidth,
    drawingTool,
    objects,
    onChangeObjects,
    onSelectionChange,
  ]);

  useEffect(() => {
    if (drawingMode && drawingTool === "erase") {
      return;
    }

    unlockDocumentScrollForEraserStroke();
  }, [drawingMode, drawingTool, unlockDocumentScrollForEraserStroke]);

  useEffect(() => {
    return () => {
      unlockDocumentScrollForEraserStroke();
    };
  }, [unlockDocumentScrollForEraserStroke]);

  useEffect(() => {
    const canvas = liveDrawingCanvasRef.current;
    if (!canvas) return;
    const activeCanvas = canvas;

    function getCanvasPoint(clientX: number, clientY: number) {
      const canvasBounds = activeCanvas.getBoundingClientRect();

      return {
        x: clientX - canvasBounds.left,
        y: clientY - canvasBounds.top,
      };
    }

    function beginCanvasStroke(id: number, point: DrawingPoint) {
      if (
        !drawingModeRef.current ||
        (drawingToolRef.current !== "draw" &&
          drawingToolRef.current !== "highlight")
      ) {
        return;
      }

      if (activeDrawingPointerIdRef.current !== null) {
        commitDrawingPoints([...activeDrawingPointsRef.current]);
      }

      activeDrawingPointerIdRef.current = id;
      activeDrawingMinDistanceRef.current = 0.1;
      activeDrawingPointsRef.current = [];
      addLiveCanvasPoint(point);
      onSelectionChange([]);
    }

    function moveCanvasStroke(id: number, point: DrawingPoint) {
      if (activeDrawingPointerIdRef.current !== id) return;

      addLiveCanvasPoint(point);
    }

    function finishCanvasStroke(id: number) {
      if (activeDrawingPointerIdRef.current !== id) return;

      activeDrawingPointerIdRef.current = null;
      canvasDrawingPointerIdRef.current = null;
      canvasDrawingTouchIdRef.current = null;
      commitDrawingPoints([...activeDrawingPointsRef.current]);
      activeDrawingPointsRef.current = [];
    }

    function handlePointerDown(event: PointerEvent) {

      if (!isDrawingPointer(event)) {
        return;
      }

      event.preventDefault();
      activeCanvas.setPointerCapture(event.pointerId);

      if (
        !drawingModeRef.current ||
        (drawingToolRef.current !== "draw" &&
          drawingToolRef.current !== "highlight")
      ) {
        return;
      }
      if (!canUsePointerForDrawing(event)) return;

      event.preventDefault();
      event.stopPropagation();
      suppressPointerDrawingUntilRef.current = Date.now() + 500;
      canvasDrawingPointerIdRef.current = event.pointerId;
      beginCanvasStroke(
        event.pointerId,
        getCanvasPoint(event.clientX, event.clientY)
      );
    }

    function handlePointerMove(event: PointerEvent) {

      if (!isDrawingPointer(event)) {
        return;
      }

      event.preventDefault();
      if (canvasDrawingPointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      const moveEvents =
        typeof event.getCoalescedEvents === "function"
          ? event.getCoalescedEvents()
          : [event];

      moveEvents.forEach((moveEvent) =>
        moveCanvasStroke(
          event.pointerId,
          getCanvasPoint(moveEvent.clientX, moveEvent.clientY)
        )
      );
    }

    function handlePointerEnd(event: PointerEvent) {

      if (!isDrawingPointer(event)) {
        return;
      }

      event.preventDefault();

      try {
        activeCanvas.releasePointerCapture(event.pointerId);
      } catch {
        // pointer might already be released
      }
      if (canvasDrawingPointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      finishCanvasStroke(event.pointerId);
    }

    function handleTouchStart(event: TouchEvent) {
      if (
        !drawingModeRef.current ||
        (drawingToolRef.current !== "draw" &&
          drawingToolRef.current !== "highlight")
      ) {
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;
      if (!isStylusTouch(touch)) return;

      event.preventDefault();
      event.stopPropagation();
      suppressPointerDrawingUntilRef.current = Date.now() + 1000;
      canvasDrawingTouchIdRef.current = touch.identifier;
      beginCanvasStroke(
        -touch.identifier - 1,
        getCanvasPoint(touch.clientX, touch.clientY)
      );
    }

    function handleTouchMove(event: TouchEvent) {
      const touchId = canvasDrawingTouchIdRef.current;
      if (touchId === null) return;

      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === touchId
      );
      if (!touch) return;

      event.preventDefault();
      moveCanvasStroke(
        -touch.identifier - 1,
        getCanvasPoint(touch.clientX, touch.clientY)
      );
    }

    function handleTouchEnd(event: TouchEvent) {
      const touchId = canvasDrawingTouchIdRef.current;
      if (touchId === null) return;

      const touch = Array.from(event.changedTouches).find(
        (item) => item.identifier === touchId
      );
      if (!touch) return;

      event.preventDefault();
      moveCanvasStroke(
        -touch.identifier - 1,
        getCanvasPoint(touch.clientX, touch.clientY)
      );
      finishCanvasStroke(-touch.identifier - 1);
    }

    activeCanvas.addEventListener("pointerdown", handlePointerDown, {
      passive: false,
    });
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerEnd, {
      passive: false,
    });
    window.addEventListener("pointercancel", handlePointerEnd, {
      passive: false,
    });
    activeCanvas.addEventListener("touchstart", handleTouchStart, {
      passive: false,
    });
    window.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
    window.addEventListener("touchend", handleTouchEnd, {
      passive: false,
    });
    window.addEventListener("touchcancel", handleTouchEnd, {
      passive: false,
    });

    return () => {
      activeCanvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      activeCanvas.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
    // Canvas drawing intentionally reads current settings through refs so the
    // listeners stay stable while the user writes quickly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingMode, drawingTool]);

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
      replacePendingDrawings([]);
      pendingDrawingUndoStackRef.current = [];
      pendingDrawingRedoStackRef.current = [];
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

    window.setTimeout(undoPendingDrawingStroke, 0);
  }, [undoRequestId]);

  useEffect(() => {
    if (
      redoRequestId === 0 ||
      lastHandledRedoRequestIdRef.current === redoRequestId
    ) {
      return;
    }

    lastHandledRedoRequestIdRef.current = redoRequestId;
    window.setTimeout(redoPendingDrawingStroke, 0);
  }, [redoRequestId]);

  function pushPendingDrawingUndoSnapshot(snapshot: NoteObject[]) {
    const snapshotCopy = cloneDrawingSnapshot(snapshot);
    const latestSnapshot = pendingDrawingUndoStackRef.current.at(-1);

    if (JSON.stringify(latestSnapshot) === JSON.stringify(snapshotCopy)) {
      return;
    }

    pendingDrawingUndoStackRef.current = [
      ...pendingDrawingUndoStackRef.current.slice(-49),
      snapshotCopy,
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

  function initializeTextBoxEditor(
    editor: HTMLElement | null,
    object: NoteObject
  ) {
    if (!editor) return;

    const nextHtml = object.html ?? escapeHtml(object.text ?? "");

    if (editor.dataset.lastObjectHtml === nextHtml) {
      return;
    }

    editor.innerHTML = nextHtml;
    editor.dataset.lastObjectHtml = nextHtml;
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
      element.style.display = "inline";
      element.style.lineHeight = "normal";
      element.style.verticalAlign = "baseline";
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

  function getSelectionBounds(ids: string[]) {
    const selectedIds = new Set(ids);
    const selectedObjects = objects.filter((object) => selectedIds.has(object.id));
    if (!selectedObjects.length) return null;

    const bounds = selectedObjects.map(getObjectBounds);
    const left = Math.min(...bounds.map((box) => box.left));
    const top = Math.min(...bounds.map((box) => box.top));
    const right = Math.max(...bounds.map((box) => box.left + box.width));
    const bottom = Math.max(...bounds.map((box) => box.top + box.height));

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  function getDuplicateId(object: NoteObject, index: number) {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${object.id}-copy-${Date.now()}-${index}`;
  }

  function cloneObjectsWithOffset(
    sourceObjects: NoteObject[],
    offset: number
  ) {
    return sourceObjects.map((object, index) => {
      const duplicateId = getDuplicateId(object, index);

      if (object.type === "line") {
        const points = getLinePoints(object);
        const bounds = getObjectBounds(object);
        const clampedOffset = clampMoveDelta(bounds, offset, offset);

        return {
          ...object,
          id: duplicateId,
          x: points.startX + clampedOffset.dx,
          y: points.startY + clampedOffset.dy,
          endX: points.endX + clampedOffset.dx,
          endY: points.endY + clampedOffset.dy,
        };
      }

      return {
        ...object,
        id: duplicateId,
        ...clampPosition(
          object.x + offset,
          object.y + offset,
          object.width,
          object.height
        ),
      };
    });
  }

  function deleteSelectedObjects() {
    if (selectedObjectIds.length === 0) return;

    const selectedIds = new Set(selectedObjectIds);
    objects.forEach((object) => {
      if (selectedIds.has(object.id) && object.type === "image" && object.src) {
        void deleteStoredImage(object.src);
      }
    });

    onChangeObjects(objects.filter((object) => !selectedIds.has(object.id)));
    onSelectionChange([]);
  }

  function cutSelectedObjects() {
    if (selectedObjectIds.length === 0) return;

    const selectedIds = new Set(selectedObjectIds);
    const selectedObjects = objects.filter((object) => selectedIds.has(object.id));
    const selectedBounds = getSelectionBounds(selectedObjectIds);

    if (!selectedObjects.length) return;

    setObjectClipboard(selectedObjects);
    setObjectClipboardAnchor(
      selectedBounds
        ? {
            x: selectedBounds.left,
            y: selectedBounds.top + selectedBounds.height,
          }
        : null
    );
    onChangeObjects(objects.filter((object) => !selectedIds.has(object.id)));
    onSelectionChange([]);
  }

  function copySelectedObjects() {
    if (selectedObjectIds.length === 0) return;

    const selectedIds = new Set(selectedObjectIds);
    const selectedObjects = objects.filter((object) => selectedIds.has(object.id));
    const selectedBounds = getSelectionBounds(selectedObjectIds);

    if (!selectedObjects.length) return;

    setObjectClipboard(selectedObjects);
    setObjectClipboardAnchor(
      selectedBounds
        ? {
            x: selectedBounds.left,
            y: selectedBounds.top + selectedBounds.height,
          }
        : null
    );
  }

  function pasteObjectClipboard() {
    if (!objectClipboard.length) return;

    const pastedObjects = cloneObjectsWithOffset(objectClipboard, 24);
    onChangeObjects([...objects, ...pastedObjects]);
    onSelectionChange(pastedObjects.map((object) => object.id));

    const pastedBounds = pastedObjects.map(getObjectBounds);
    const left = Math.min(...pastedBounds.map((box) => box.left));
    const bottom = Math.max(...pastedBounds.map((box) => box.top + box.height));
    setObjectClipboardAnchor({ x: left, y: bottom });
    setObjectClipboard(pastedObjects);
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

  function duplicateSelectedObjects() {
    if (selectedObjectIds.length === 0) return;

    const selectedIds = new Set(selectedObjectIds);
    const duplicatedObjects = cloneObjectsWithOffset(
      objects.filter(
        (object) => selectedIds.has(object.id) && canDuplicateObject(object)
      ),
      24
    );

    if (!duplicatedObjects.length) return;

    onChangeObjects([...objects, ...duplicatedObjects]);
    onSelectionChange(duplicatedObjects.map((object) => object.id));
  }

  function renderActionToolbar() {
    const canDuplicateSelection = objects.some(
      (object) =>
        selectedObjectIds.includes(object.id) && canDuplicateObject(object)
    );

    return (
      <div className={objectControlPanelClass}>
        {renderMoveActionButton()}
        {canDuplicateSelection && (
          <button
            type="button"
            className={`${objectControlButtonClass} text-left`}
            title="Duplicate selection"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              duplicateSelectedObjects();
            }}
          >
            Duplicate
          </button>
        )}
        {renderSelectionActionButton("Cut", "Cut selected objects", cutSelectedObjects)}
        {renderSelectionActionButton("Copy", "Copy selected objects", copySelectedObjects)}
        {objectClipboard.length > 0 &&
          renderSelectionActionButton(
            "Paste",
            "Paste copied or cut objects",
            pasteObjectClipboard
          )}
        {renderSelectionActionButton(
          "Delete",
          "Delete selected objects",
          deleteSelectedObjects
        )}
      </div>
    );
  }

  function renderMoveActionButton() {
    return (
      <div className="group relative">
        <button
          type="button"
          className={`${objectControlButtonClass} w-full text-center`}
          title="Move selected objects"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          Move
        </button>
        <div
          className={
            isDark
              ? "pointer-events-auto absolute left-full top-0 z-50 ml-1 hidden min-w-20 flex-col gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-lg group-hover:flex"
              : "pointer-events-auto absolute left-full top-0 z-50 ml-1 hidden min-w-20 flex-col gap-1 rounded-lg border bg-white p-1 shadow-lg group-hover:flex"
          }
        >
          {(["front", "back"] as LayerDirection[]).map((direction) => (
            <button
              key={direction}
              type="button"
              className={`${objectControlButtonClass} text-left`}
              title={direction === "back" ? "Send to back" : "Bring to front"}
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
          ))}
        </div>
      </div>
    );
  }

  function renderSelectionActionButton(
    label: string,
    title: string,
    action: () => void
  ) {
    return (
      <button
        type="button"
        className={objectControlButtonClass}
        title={title}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          action();
        }}
      >
        {label}
      </button>
    );
  }

  function startDrag(
    event: React.PointerEvent<Element>,
    draggedObject: NoteObject
  ) {
    event.preventDefault();
    event.stopPropagation();
    const dragElement = event.currentTarget;
    const pointerId = event.pointerId;
    dragElement.setPointerCapture?.(pointerId);

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
    const movingBounds =
      getSelectionBounds(movingIds) ?? getObjectBounds(draggedObject);

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const moveDelta = clampMoveDelta(
        movingBounds,
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );

      onChangeObjects(
        objects.map((object) => {
          const original = originalObjects.get(object.id);
          if (!original) return object;

          if (original.type === "line") {
            const points = getLinePoints(original);
            return {
              ...object,
              x: points.startX + moveDelta.dx,
              y: points.startY + moveDelta.dy,
              endX: points.endX + moveDelta.dx,
              endY: points.endY + moveDelta.dy,
            };
          }

          const nextPosition = clampPosition(
            original.x + moveDelta.dx,
            original.y + moveDelta.dy,
            original.width,
            original.height
          );

          return {
            ...object,
            x: nextPosition.x,
            y: nextPosition.y,
          };
        })
      );
    }

    function handleUp() {
      if (dragElement.hasPointerCapture?.(pointerId)) {
        dragElement.releasePointerCapture?.(pointerId);
      }

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
    const originalVertices = isVertexShape(object)
      ? getShapeVertices(object)
      : null;

    function resizeObject(width: number, height: number) {
      const nextSize = clampSizeForObject(object, width, height);

      updateObject(object.id, {
        width: nextSize.width,
        height: nextSize.height,
        ...(originalVertices
          ? {
              vertices: originalVertices.map((vertex) => ({
                x: (vertex.x / Math.max(1, originalWidth)) * nextSize.width,
                y: (vertex.y / Math.max(1, originalHeight)) * nextSize.height,
              })),
            }
          : {}),
      });
    }

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const dx = moveEvent.clientX - pointerX;
      const dy = moveEvent.clientY - pointerY;

      if (mode === "horizontal") {
        resizeObject(Math.max(30, originalWidth + dx), originalHeight);
        return;
      }

      if (mode === "vertical") {
        resizeObject(originalWidth, Math.max(30, originalHeight + dy));
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

        const maxWidth = Math.max(1, pageWidth - object.x);
        const maxHeight = Math.max(1, drawingHeight - object.y);

        if (width > maxWidth) {
          width = maxWidth;
          height = width / aspectRatio;
        }

        if (height > maxHeight) {
          height = maxHeight;
          width = height * aspectRatio;
        }

        resizeObject(width, height);
        return;
      }

      resizeObject(
        Math.max(30, originalWidth + dx),
        Math.max(30, originalHeight + dy)
      );
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

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
    const originalPoints = getLinePoints(object);
    const snapDistance = 18;

    function snapToNearbyLineEndpoint(x: number, y: number) {
      let snappedPoint = {
        x: clampValue(x, 0, pageWidth),
        y: clampValue(y, 0, drawingHeight),
      };
      let closestDistance = snapDistance;

      objects.forEach((lineObject) => {
        if (lineObject.id === object.id || lineObject.type !== "line") return;

        const linePoints = getLinePoints(lineObject);
        [
          { x: linePoints.startX, y: linePoints.startY },
          { x: linePoints.endX, y: linePoints.endY },
        ].forEach((targetPoint) => {
          const clampedTargetPoint = {
            x: clampValue(targetPoint.x, 0, pageWidth),
            y: clampValue(targetPoint.y, 0, drawingHeight),
          };
          const distance = Math.hypot(
            clampedTargetPoint.x - snappedPoint.x,
            clampedTargetPoint.y - snappedPoint.y
          );

          if (distance <= closestDistance) {
            closestDistance = distance;
            snappedPoint = clampedTargetPoint;
          }
        });
      });

      return snappedPoint;
    }

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const dx = moveEvent.clientX - pointerX;
      const dy = moveEvent.clientY - pointerY;

      if (endpoint === "start") {
        const snappedStart = snapToNearbyLineEndpoint(
          originalPoints.startX + dx,
          originalPoints.startY + dy
        );

        updateObject(object.id, {
          x: snappedStart.x,
          y: snappedStart.y,
          endX: originalPoints.endX,
          endY: originalPoints.endY,
        });
        return;
      }

      const snappedEnd = snapToNearbyLineEndpoint(
        originalPoints.endX + dx,
        originalPoints.endY + dy
      );

      updateObject(object.id, {
        x: originalPoints.startX,
        y: originalPoints.startY,
        endX: snappedEnd.x,
        endY: snappedEnd.y,
      });
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function beginEraserStroke(initialPoint: DrawingPoint): ActiveEraserStroke {
    lockDocumentScrollForEraserStroke();
    setIsEraserScrollLocked(true);
    let workingObjects = objectsRef.current;
    let workingPendingDrawings = pendingDrawingsRef.current;
    const eraserRadius = Math.max(2, drawingStrokeWidthRef.current / 2);
    let pendingUndoSnapshotCaptured = false;

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
        objectsRef.current = nextObjects;
        onChangeObjectsRef.current(nextObjects);
      }

      if (pendingChanged) {
        if (!pendingUndoSnapshotCaptured) {
          pushPendingDrawingUndoSnapshot(workingPendingDrawings);
          pendingUndoSnapshotCaptured = true;
          pendingDrawingRedoStackRef.current = [];
        }

        workingPendingDrawings = nextPendingDrawings;
        replacePendingDrawings(nextPendingDrawings);
      }

      if (savedChanged || pendingChanged) {
        onSelectionChangeRef.current([]);
      }
    }

    function finish() {
      setEraserPoint(null);
      setIsEraserScrollLocked(false);
      unlockDocumentScrollForEraserStroke();
    }

    eraseAt(initialPoint);

    return { eraseAt, finish };
  }

  beginEraserStrokeRef.current = beginEraserStroke;

  function startErasing(event: React.PointerEvent<HTMLDivElement>) {
    if (!canUsePointerForDrawing(event)) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;
    const erasingElement = event.currentTarget;
    const pointerId = event.pointerId;

    const getPoint = (pointerEvent: PointerEvent | React.PointerEvent) => ({
      x: pointerEvent.clientX - layerBounds.left,
      y: pointerEvent.clientY - layerBounds.top,
    });

    const eraserStroke = beginEraserStroke(getPoint(event));

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;

      moveEvent.preventDefault();

      const moveEvents =
        typeof moveEvent.getCoalescedEvents === "function"
          ? moveEvent.getCoalescedEvents()
          : [moveEvent];

      moveEvents.forEach((pointerEvent) =>
        eraserStroke.eraseAt(getPoint(pointerEvent))
      );
    }

    function finishErasing(finishEvent: PointerEvent) {
      if (finishEvent.pointerId !== pointerId) return;

      finishEvent.preventDefault();
      erasingElement.removeEventListener("pointermove", handleMove);
      erasingElement.removeEventListener("pointerup", finishErasing);
      erasingElement.removeEventListener("pointercancel", finishErasing);
      erasingElement.removeEventListener("lostpointercapture", finishErasing);
      eraserStroke.finish();

      if (erasingElement.hasPointerCapture(pointerId)) {
        erasingElement.releasePointerCapture(pointerId);
      }
    }

    erasingElement.addEventListener("pointermove", handleMove, { passive: false });
    erasingElement.addEventListener("pointerup", finishErasing);
    erasingElement.addEventListener("pointercancel", finishErasing);
    erasingElement.addEventListener("lostpointercapture", finishErasing);
  }

  function getActiveDrawingPoint(pointerEvent: PointerEvent) {
    const layerBounds = activeDrawingBoundsRef.current;
    if (!layerBounds) return null;

    return {
      x: pointerEvent.clientX - layerBounds.left,
      y: pointerEvent.clientY - layerBounds.top,
    };
  }

  function addActiveDrawingPoint(nextPoint: DrawingPoint) {
    if (!isPointInsidePaper(nextPoint)) return;

    const points = activeDrawingPointsRef.current;
    const lastPoint = points[points.length - 1];

    if (!lastPoint) {
      points.push(nextPoint);
      return;
    }

    const distance = Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y);

    if (distance < activeDrawingMinDistanceRef.current) return;

    points.push(nextPoint);
  }

  function finishActiveDrawing(pointerId: number) {
    if (activeDrawingPointerIdRef.current !== pointerId) return;

    activeDrawingPointerIdRef.current = null;
    activeDrawingBoundsRef.current = null;

    if (activeDrawingFrameRef.current !== null) {
      window.cancelAnimationFrame(activeDrawingFrameRef.current);
      activeDrawingFrameRef.current = null;
    }

    const finalPoints = [...activeDrawingPointsRef.current];
    activeDrawingPointsRef.current = [];
    setActiveDrawingPoints([]);

    if (finalPoints.length < 2) return;

    const strokeWidth = drawingStrokeWidthRef.current;
    const padding = Math.max(6, strokeWidth);
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
      color: drawingColorRef.current,
      drawingTool:
        drawingToolRef.current === "highlight" ? "highlight" : "draw",
      strokeWidth,
      flipX: false,
      flipY: false,
    };

    const currentPendingDrawings = pendingDrawingsRef.current;
    const nextPendingDrawings = [...currentPendingDrawings, newDrawing];

    pushPendingDrawingUndoSnapshot(currentPendingDrawings);
    pendingDrawingRedoStackRef.current = [];
    replacePendingDrawings(nextPendingDrawings);
    onSelectionChange([]);
  }

  function startDrawingStroke(
    pointerId: number,
    firstPoint: DrawingPoint,
    minPointDistance: number
  ) {
    if (!isPointInsidePaper(firstPoint)) {
      return;
    }

    if (activeDrawingPointerIdRef.current !== null) {
      finishActiveDrawing(activeDrawingPointerIdRef.current);
    }

    activeDrawingPointerIdRef.current = pointerId;
    activeDrawingMinDistanceRef.current = minPointDistance;
    activeDrawingPointsRef.current = [firstPoint];
    setActiveDrawingPoints([firstPoint]);
    onSelectionChange([]);
  }

  function startDrawing(event: PointerEvent) {
    if (!drawingModeRef.current || drawingToolRef.current === "erase") return;
    if (!canUsePointerForDrawing(event)) return;
    if (Date.now() < suppressPointerDrawingUntilRef.current) return;

    event.preventDefault();
    event.stopPropagation();

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;

    activeDrawingBoundsRef.current = layerBounds;

    const firstPoint = {
      x: event.clientX - layerBounds.left,
      y: event.clientY - layerBounds.top,
    };

    startDrawingStroke(event.pointerId, firstPoint, event.pointerType === "pen" ? 0.1 : 1);
  }

  useEffect(() => {
    const drawingLayer = layerRef.current;
    if (!drawingLayer) return;

    function getTouchCentroid(touches: TouchList) {
      const touchItems = Array.from(touches);
      const total = touchItems.reduce(
        (sum, touch) => ({
          x: sum.x + touch.clientX,
          y: sum.y + touch.clientY,
        }),
        { x: 0, y: 0 }
      );

      return {
        x: total.x / Math.max(1, touchItems.length),
        y: total.y / Math.max(1, touchItems.length),
      };
    }

    function handleGestureTouchStart(event: TouchEvent) {
      if (!drawingModeRef.current) return;
      if (event.touches.length !== 2 && event.touches.length !== 3) return;

      const center = getTouchCentroid(event.touches);
      tabletGestureRef.current = {
        touchCount: event.touches.length,
        startTime: Date.now(),
        startX: center.x,
        startY: center.y,
        maxDistance: 0,
      };
    }

    function handleGestureTouchMove(event: TouchEvent) {
      const gesture = tabletGestureRef.current;
      if (!gesture) return;

      event.preventDefault();

      if (event.touches.length !== gesture.touchCount) {
        tabletGestureRef.current = null;
        return;
      }

      const center = getTouchCentroid(event.touches);
      gesture.maxDistance = Math.max(
        gesture.maxDistance,
        Math.hypot(center.x - gesture.startX, center.y - gesture.startY)
      );
    }

    function handleGestureTouchEnd(event: TouchEvent) {
      const gesture = tabletGestureRef.current;
      if (!gesture) return;

      if (event.touches.length > 0) return;

      event.preventDefault();
      tabletGestureRef.current = null;

      const duration = Date.now() - gesture.startTime;
      if (duration > 420 || gesture.maxDistance > 28) return;

      if (gesture.touchCount === 2) {
        undoPendingDrawingStroke();
        return;
      }

      redoPendingDrawingStroke();
    }

    function handleNativePointerDown(event: PointerEvent) {
      if (event.target === liveDrawingCanvasRef.current) return;
      startDrawing(event);
    }

    function handleNativePointerMove(event: PointerEvent) {
      if (event.target === liveDrawingCanvasRef.current) return;
      if (activeDrawingPointerIdRef.current !== event.pointerId) return;

      event.preventDefault();

      const moveEvents =
        typeof event.getCoalescedEvents === "function"
          ? event.getCoalescedEvents()
          : [event];

      moveEvents.forEach((pointerEvent) => {
        const point = getActiveDrawingPoint(pointerEvent);
        if (point) addActiveDrawingPoint(point);
      });
      scheduleActiveDrawingPaint();
    }

    function handleNativeRawUpdate(event: Event) {
      handleNativePointerMove(event as PointerEvent);
    }

    function handleNativePointerEnd(event: PointerEvent) {
      if (event.target === liveDrawingCanvasRef.current) return;
      if (activeDrawingPointerIdRef.current !== event.pointerId) return;

      event.preventDefault();
      finishActiveDrawing(event.pointerId);
    }

    function getTouchDrawingPoint(touch: Touch) {
      const layerBounds = activeDrawingBoundsRef.current;
      if (!layerBounds) return null;

      return {
        x: touch.clientX - layerBounds.left,
        y: touch.clientY - layerBounds.top,
      };
    }

    function getLayerTouchPoint(touch: Touch) {
      const layerBounds = layerRef.current?.getBoundingClientRect();
      if (!layerBounds) return null;

      return {
        x: touch.clientX - layerBounds.left,
        y: touch.clientY - layerBounds.top,
      };
    }

    function handleNativeTouchStart(event: TouchEvent) {
      if (event.target === liveDrawingCanvasRef.current) return;
      if (!drawingModeRef.current) return;

      const touch = event.changedTouches[0];
      if (!touch) return;
      if (!isStylusTouch(touch)) return;

      event.preventDefault();
      event.stopPropagation();
      suppressPointerDrawingUntilRef.current = Date.now() + 1000;

      if (drawingToolRef.current === "erase") {
        const point = getLayerTouchPoint(touch);
        const eraserStrokeStarter = beginEraserStrokeRef.current;
        if (!point || !eraserStrokeStarter) return;

        eraserTouchIdRef.current = touch.identifier;
        activeEraserStrokeRef.current = eraserStrokeStarter(point);
        return;
      }

      const layerBounds = layerRef.current?.getBoundingClientRect();
      if (!layerBounds) return;

      activeDrawingBoundsRef.current = layerBounds;
      startDrawingStroke(
        -touch.identifier - 1,
        {
          x: touch.clientX - layerBounds.left,
          y: touch.clientY - layerBounds.top,
        },
        0.1
      );
    }

    function handleNativeTouchMove(event: TouchEvent) {
      if (event.target === liveDrawingCanvasRef.current) return;
      const eraserTouchId = eraserTouchIdRef.current;

      if (eraserTouchId !== null) {
        const touch = Array.from(event.changedTouches).find(
          (item) => item.identifier === eraserTouchId
        );
        if (!touch) return;

        event.preventDefault();
        event.stopPropagation();

        const point = getLayerTouchPoint(touch);
        if (point) activeEraserStrokeRef.current?.eraseAt(point);
        return;
      }

      const activeTouchId = activeDrawingPointerIdRef.current;

      if (activeTouchId === null || activeTouchId >= 0) return;

      event.preventDefault();

      Array.from(event.changedTouches).forEach((touch) => {
        if (-touch.identifier - 1 !== activeTouchId) return;

        const point = getTouchDrawingPoint(touch);
        if (point) addActiveDrawingPoint(point);
      });

      scheduleActiveDrawingPaint();
    }

    function handleNativeTouchEnd(event: TouchEvent) {
      if (event.target === liveDrawingCanvasRef.current) return;
      const eraserTouchId = eraserTouchIdRef.current;

      if (eraserTouchId !== null) {
        const touch = Array.from(event.changedTouches).find(
          (item) => item.identifier === eraserTouchId
        );
        if (!touch) return;

        event.preventDefault();
        event.stopPropagation();

        const point = getLayerTouchPoint(touch);
        if (point) activeEraserStrokeRef.current?.eraseAt(point);

        activeEraserStrokeRef.current?.finish();
        activeEraserStrokeRef.current = null;
        eraserTouchIdRef.current = null;
        return;
      }

      const activeTouchId = activeDrawingPointerIdRef.current;

      if (activeTouchId === null || activeTouchId >= 0) return;

      const endedTouch = Array.from(event.changedTouches).find(
        (touch) => -touch.identifier - 1 === activeTouchId
      );

      if (!endedTouch) return;

      event.preventDefault();
      const finalPoint = getTouchDrawingPoint(endedTouch);
      if (finalPoint) addActiveDrawingPoint(finalPoint);
      finishActiveDrawing(activeTouchId);
    }

    drawingLayer.addEventListener("pointerdown", handleNativePointerDown, {
      passive: false,
      capture: true,
    });
    drawingLayer.addEventListener("touchstart", handleGestureTouchStart, {
      passive: false,
      capture: true,
    });
    drawingLayer.addEventListener("touchstart", handleNativeTouchStart, {
      passive: false,
      capture: true,
    });
    window.addEventListener("pointermove", handleNativePointerMove, {
      passive: false,
      capture: true,
    });
    window.addEventListener("pointerrawupdate", handleNativeRawUpdate, {
      passive: false,
      capture: true,
    });
    window.addEventListener("pointerup", handleNativePointerEnd, {
      capture: true,
    });
    window.addEventListener("pointercancel", handleNativePointerEnd, {
      capture: true,
    });
    window.addEventListener("touchmove", handleNativeTouchMove, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchmove", handleGestureTouchMove, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchend", handleNativeTouchEnd, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchend", handleGestureTouchEnd, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchcancel", handleNativeTouchEnd, {
      passive: false,
      capture: true,
    });
    window.addEventListener("touchcancel", handleGestureTouchEnd, {
      passive: false,
      capture: true,
    });

    return () => {
      drawingLayer.removeEventListener("pointerdown", handleNativePointerDown, {
        capture: true,
      });
      drawingLayer.removeEventListener("touchstart", handleGestureTouchStart, {
        capture: true,
      });
      drawingLayer.removeEventListener("touchstart", handleNativeTouchStart, {
        capture: true,
      });
      window.removeEventListener("pointermove", handleNativePointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerrawupdate", handleNativeRawUpdate, {
        capture: true,
      });
      window.removeEventListener("pointerup", handleNativePointerEnd, {
        capture: true,
      });
      window.removeEventListener("pointercancel", handleNativePointerEnd, {
        capture: true,
      });
      window.removeEventListener("touchmove", handleNativeTouchMove, {
        capture: true,
      });
      window.removeEventListener("touchmove", handleGestureTouchMove, {
        capture: true,
      });
      window.removeEventListener("touchend", handleNativeTouchEnd, {
        capture: true,
      });
      window.removeEventListener("touchend", handleGestureTouchEnd, {
        capture: true,
      });
      window.removeEventListener("touchcancel", handleNativeTouchEnd, {
        capture: true,
      });
      window.removeEventListener("touchcancel", handleGestureTouchEnd, {
        capture: true,
      });
    };
    // The native drawing listeners must stay attached once; drawing state is read
    // through refs so fast Apple Pencil strokes are not missed during re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      moveEvent.preventDefault();

      const movedVertices = absoluteVertices.map((vertex, index) =>
        index === vertexIndex
          ? {
              x: clampValue(vertex.x + moveEvent.clientX - pointerX, 0, pageWidth),
              y: clampValue(
                vertex.y + moveEvent.clientY - pointerY,
                0,
                drawingHeight
              ),
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
    const startX = clampValue(event.clientX - layerLeft, 0, pageWidth);
    const startY = clampValue(event.clientY - layerTop, 0, drawingHeight);
    onSelectionChange([]);
    setSelectionPath([]);

    if (selectionTool === "lasso") {
      const firstPoint = { x: startX, y: startY };
      let pathPoints = [firstPoint];
      setSelectionPath(pathPoints);

      function handleLassoMove(moveEvent: PointerEvent) {
        moveEvent.preventDefault();

        const nextPoint = {
          x: clampValue(moveEvent.clientX - layerLeft, 0, pageWidth),
          y: clampValue(moveEvent.clientY - layerTop, 0, drawingHeight),
        };
        const lastPoint = pathPoints[pathPoints.length - 1];

        if (Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y) < 4) {
          return;
        }

        pathPoints = [...pathPoints, nextPoint];
        setSelectionPath(pathPoints);

        if (pathPoints.length >= 3) {
          onSelectionChange(
            objects
              .filter((object) =>
                doesPolygonSelectBox(pathPoints, getObjectBounds(object))
              )
              .map((object) => object.id)
          );
        }
      }

      function handleLassoUp() {
        setSelectionPath([]);
        window.removeEventListener("pointermove", handleLassoMove);
        window.removeEventListener("pointerup", handleLassoUp);
      }

      window.addEventListener("pointermove", handleLassoMove);
      window.addEventListener("pointerup", handleLassoUp);
      return;
    }

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const currentX = clampValue(moveEvent.clientX - layerLeft, 0, pageWidth);
      const currentY = clampValue(
        moveEvent.clientY - layerTop,
        0,
        drawingHeight
      );
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
  const hasGroupSelection = selectedObjectIds.length > 1;
  const selectedGroupBounds = hasGroupSelection
    ? getSelectionBounds(selectedObjectIds)
    : null;
  const shouldLockEraserScroll =
    isEraserScrollLocked && drawingMode && drawingTool === "erase";
  const canDuplicateGroupSelection = objects.some(
    (object) =>
      selectedObjectIds.includes(object.id) && canDuplicateObject(object)
  );

  return (
    <div
      ref={layerRef}
      className={
        selectionMode || drawingMode
          ? `pointer-events-auto absolute inset-0 z-20 select-none ${
              drawingMode && drawingTool === "erase"
                ? "cursor-cell"
                : "cursor-crosshair"
            }`
          : "pointer-events-none absolute inset-0 z-20"
      }
      style={{
        touchAction: shouldLockEraserScroll ? "none" : "pan-y",
        WebkitUserSelect: drawingMode || selectionMode ? "none" : undefined,
        userSelect: drawingMode || selectionMode ? "none" : undefined,
        WebkitTouchCallout: drawingMode || selectionMode ? "none" : undefined,
        overscrollBehavior: shouldLockEraserScroll ? "none" : "auto",
      }}
      onPointerDown={(event) => {
        if (drawingMode) {
          if (!isDrawingPointer(event)) {
            return;
          }

          if (drawingTool === "erase") {
            startErasing(event);
          }

          return;
        }

        startSelectionBox(event);
      }}
    >
      {drawingMode && (drawingTool === "draw" || drawingTool === "highlight") && (
        <canvas
          ref={liveDrawingCanvasRef}
          className="absolute inset-0 z-30 h-full w-full"
          style={{
            width: pageWidth,
            height: drawingHeight,
            touchAction: "pan-y",
            WebkitUserSelect: "none",
            userSelect: "none",
            WebkitTouchCallout: "none",
          }}
        />
      )}

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
            strokeOpacity={drawingTool === "highlight" ? 0.45 : 1}
            strokeWidth={drawingStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              mixBlendMode: drawingTool === "highlight" ? "multiply" : "normal",
            }}
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
              strokeOpacity={object.drawingTool === "highlight" ? 0.45 : 1}
              strokeWidth={object.strokeWidth ?? 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{
                mixBlendMode:
                  object.drawingTool === "highlight" ? "multiply" : "normal",
              }}
            />
          </svg>
        </div>
      ))}

      {objects.map((object) => {
        const selected = !drawingMode && selectedObjectIds.includes(object.id);

        if (object.type === "line") {
          const points = getLinePoints(object);
          const lineStrokeWidth = object.strokeWidth ?? 5;

          return (
            <div
              key={object.id}
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: selected ? 60 : undefined }}
            >
              <svg className="absolute inset-0 h-full w-full overflow-visible">
                {selected && (
                  <line
                    x1={points.startX}
                    y1={points.startY}
                    x2={points.endX}
                    y2={points.endY}
                    stroke="#2563eb"
                    strokeWidth={Math.max(11, lineStrokeWidth + 6)}
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
                  strokeWidth={lineStrokeWidth}
                  strokeLinecap="round"
                />
                <line
                  x1={points.startX}
                  y1={points.startY}
                  x2={points.endX}
                  y2={points.endY}
                  stroke="transparent"
                  strokeWidth={Math.max(20, lineStrokeWidth + 14)}
                  className="pointer-events-auto cursor-move"
                  style={{ touchAction: "none" }}
                  onPointerDown={(event) => startDrag(event, object)}
                />
              </svg>

              {selected && hasSingleSelection && (
                <>
                  <div
                    className="absolute"
                    style={{ left: points.startX, top: points.startY }}
                  >
                    {renderActionToolbar()}
                  </div>
                  <button
                    type="button"
                    className={
                      isDark
                        ? "pointer-events-auto absolute rounded-md bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-sm ring-1 ring-slate-700"
                        : "pointer-events-auto absolute rounded-md bg-white px-2 py-1 text-xs text-gray-700 shadow-sm ring-1 ring-gray-200"
                    }
                    style={{ left: points.startX + 12, top: points.startY - 30 }}
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
                          ? "pointer-events-auto absolute z-50 w-44 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg"
                          : "pointer-events-auto absolute z-50 w-44 rounded-lg border bg-white p-2 text-xs shadow-lg"
                      }
                      style={{ left: points.startX + 48, top: points.startY - 32 }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <label className={isDark ? "block text-slate-100" : "block text-gray-700"}>
                        Thickness: {lineStrokeWidth}px
                        <input
                          type="range"
                          min="1"
                          max="24"
                          value={lineStrokeWidth}
                          className="mt-2 w-full"
                          onPointerDown={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            updateObject(object.id, {
                              strokeWidth: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <div
                    className={
                      isDark
                        ? "pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none cursor-crosshair rounded-full border-2 border-blue-500 bg-slate-900 shadow-sm"
                        : "pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none cursor-crosshair rounded-full border-2 border-blue-600 bg-white shadow-sm"
                    }
                    style={{ left: points.startX, top: points.startY, touchAction: "none" }}
                    title="Move line start point"
                    onPointerDown={(event) =>
                      startLineEndpointDrag(event, object, "start")
                    }
                  />
                  <div
                    className={
                      isDark
                        ? "pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none cursor-crosshair rounded-full border-2 border-blue-500 bg-slate-900 shadow-sm"
                        : "pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none cursor-crosshair rounded-full border-2 border-blue-600 bg-white shadow-sm"
                    }
                    style={{ left: points.endX, top: points.endY, touchAction: "none" }}
                    title="Move line end point"
                    onPointerDown={(event) =>
                      startLineEndpointDrag(event, object, "end")
                    }
                  />
                </>
              )}
            </div>
          );
        }

        const ignoreDuringDrawing = drawingMode && object.type !== "textbox";
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
              zIndex: selected ? 60 : undefined,
              touchAction: object.type === "textbox" ? "auto" : "none",
              WebkitUserSelect: object.type === "textbox" ? undefined : "none",
              userSelect: object.type === "textbox" ? undefined : "none",
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
                      className="absolute -top-7 left-8 rounded-md bg-black px-2 py-1 text-xs text-white"
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
                  ref={(editor) => initializeTextBoxEditor(editor, object)}
                  contentEditable
                  suppressContentEditableWarning
                  className="h-full w-full overflow-auto whitespace-pre-wrap border-none bg-transparent p-0 text-gray-950 outline-none empty:before:text-gray-400 empty:before:content-['Type_here...']"
                  style={{
                    color: object.color ?? (isDark ? "#f8fafc" : "#111827"),
                    fontSize: `${object.fontSize ?? 16}px`,
                    fontFamily: object.fontFamily ?? "Arial",
                    lineHeight: "normal",
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectionChange([object.id]);
                  }}
                  onMouseUp={(event) => saveTextSelection(event.currentTarget)}
                  onKeyUp={(event) => saveTextSelection(event.currentTarget)}
                  onInput={(event) =>
                    {
                      event.currentTarget.dataset.lastObjectHtml =
                        event.currentTarget.innerHTML;
                      updateTextBoxContent(object.id, event.currentTarget);
                    }
                  }
                  onPaste={(event) => {
                    event.preventDefault();
                    const text = event.clipboardData.getData("text/plain");
                    document.execCommand("insertText", false, text);
                    event.currentTarget.dataset.lastObjectHtml =
                      event.currentTarget.innerHTML;
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
                  strokeOpacity={object.drawingTool === "highlight" ? 0.45 : 1}
                  strokeWidth={object.strokeWidth ?? 4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  style={{
                    mixBlendMode:
                      object.drawingTool === "highlight" ? "multiply" : "normal",
                  }}
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
                        ? "pointer-events-auto absolute -top-7 left-12 z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg"
                        : "pointer-events-auto absolute -top-7 left-12 z-50 flex items-center gap-2 rounded-lg border bg-white p-2 text-xs shadow-lg"
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
                      className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none cursor-crosshair rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                  style={{ left: vertex.x, top: vertex.y }}
                  onPointerDown={(event) =>
                    startVertexDrag(event, object, index)
                  }
                />
              ))}

            {selected && hasSingleSelection && (
              <>
                {renderActionToolbar()}

                {(object.type === "image" || object.type === "sticker") && (
                  <>
                    <div
                      className={`absolute -right-2 top-1/2 h-7 w-3 -translate-y-1/2 touch-none cursor-ew-resize rounded-full ${objectHandleClass}`}
                      title="Resize width"
                      onPointerDown={(event) =>
                        startResize(event, object, "horizontal")
                      }
                    />
                    <div
                      className={`absolute -bottom-2 left-1/2 h-3 w-7 -translate-x-1/2 touch-none cursor-ns-resize rounded-full ${objectHandleClass}`}
                      title="Resize height"
                      onPointerDown={(event) =>
                        startResize(event, object, "vertical")
                      }
                    />
                    <div
                      className={`absolute -right-2 -bottom-2 h-4 w-4 touch-none cursor-nwse-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                      title="Scale proportionally"
                      onPointerDown={(event) =>
                        startResize(event, object, "proportional")
                      }
                    />
                  </>
                )}
                {isVertexShape(object) && shapeEditMode === "resize" && (
                  <div
                    className={`absolute -right-2 -bottom-2 h-4 w-4 touch-none cursor-nwse-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
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
                    className={`absolute -right-2 -bottom-2 h-4 w-4 touch-none cursor-se-resize rounded-full ${objectHandleClass}`}
                    onPointerDown={(event) =>
                      startResize(event, object, "free")
                    }
                  />
                )}
              </>
            )}
          </div>
        );
      })}

      {selectedGroupBounds && (
        <div
          className={selectionActionPanelClass}
          style={{
            left: selectedGroupBounds.left,
            top: selectedGroupBounds.top + selectedGroupBounds.height + 8,
            zIndex: 80,
          }}
        >
          {renderMoveActionButton()}
          {canDuplicateGroupSelection &&
            renderSelectionActionButton(
              "Duplicate",
              "Duplicate selected objects",
              duplicateSelectedObjects
            )}
          {renderSelectionActionButton("Cut", "Cut selected objects", cutSelectedObjects)}
          {renderSelectionActionButton("Copy", "Copy selected objects", copySelectedObjects)}
          {objectClipboard.length > 0 &&
            renderSelectionActionButton(
              "Paste",
              "Paste copied or cut objects",
              pasteObjectClipboard
            )}
          {renderSelectionActionButton(
            "Delete",
            "Delete selected objects",
            deleteSelectedObjects
          )}
        </div>
      )}

      {!selectedGroupBounds && objectClipboard.length > 0 && objectClipboardAnchor && (
        <div
          className={selectionActionPanelClass}
          style={{
            left: objectClipboardAnchor.x + 8,
            top: objectClipboardAnchor.y + 8,
            zIndex: 80,
          }}
        >
          {renderSelectionActionButton(
            "Paste",
            "Paste cut objects",
            pasteObjectClipboard
          )}
        </div>
      )}

      {selectionBox && (
        <div
          className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/15"
          style={selectionBox}
        />
      )}

      {selectionPath.length > 1 && (
        <svg className="pointer-events-none absolute inset-0 z-[90] h-full w-full overflow-visible">
          <path
            d={`${getDrawingPath(selectionPath)} Z`}
            fill="rgba(59, 130, 246, 0.12)"
            stroke="#2563eb"
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
