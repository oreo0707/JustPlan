"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawingPoint, NoteObject, ShapeVertex } from "@/lib/types";
import { StoredImage } from "@/components/StoredImage";
import { deleteStoredImage, duplicateStoredImage } from "@/lib/image-storage";

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
  viewScale?: number;
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

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

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

function createLineSegmentFromProgress(
  source: NoteObject,
  points: ReturnType<typeof getLinePoints>,
  startProgress: number,
  endProgress: number,
  id: string
) {
  const startX =
    points.startX + (points.endX - points.startX) * startProgress;
  const startY =
    points.startY + (points.endY - points.startY) * startProgress;
  const endX = points.startX + (points.endX - points.startX) * endProgress;
  const endY = points.startY + (points.endY - points.startY) * endProgress;

  return {
    ...source,
    id,
    x: startX,
    y: startY,
    endX,
    endY,
    width: Math.max(1, Math.abs(endX - startX)),
    height: Math.max(1, Math.abs(endY - startY)),
  };
}

function eraseLineAtPoint(
  object: NoteObject,
  point: DrawingPoint,
  hitRadius: number
) {
  if (object.type !== "line") {
    return { changed: false, objects: [object] };
  }

  const linePoints = getLinePoints(object);
  const segmentStart = { x: linePoints.startX, y: linePoints.startY };
  const segmentEnd = { x: linePoints.endX, y: linePoints.endY };

  if (getDistanceToSegment(point, segmentStart, segmentEnd) > hitRadius) {
    return { changed: false, objects: [object] };
  }

  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentY = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const segmentLength = Math.sqrt(segmentLengthSquared);

  if (segmentLength < 1) {
    return { changed: true, objects: [] };
  }

  const progress = clampNumber(
    ((point.x - segmentStart.x) * segmentX +
      (point.y - segmentStart.y) * segmentY) /
      segmentLengthSquared,
    0,
    1
  );
  const eraseProgress = Math.min(0.45, hitRadius / segmentLength);
  const keptRanges: Array<[number, number]> = [
    [0, Math.max(0, progress - eraseProgress)],
    [Math.min(1, progress + eraseProgress), 1],
  ];

  const objects = keptRanges
    .filter(([start, end]) => (end - start) * segmentLength >= 8)
    .map(([start, end], index) =>
      createLineSegmentFromProgress(
        object,
        linePoints,
        start,
        end,
        index === 0 ? object.id : crypto.randomUUID()
      )
    );

  return {
    changed: true,
    objects,
  };
}

function doesEraserTouchBox(
  object: NoteObject,
  point: DrawingPoint,
  hitRadius: number
) {
  const bounds = getObjectBounds(object);

  return boxesIntersect(
    {
      left: point.x - hitRadius,
      top: point.y - hitRadius,
      width: hitRadius * 2,
      height: hitRadius * 2,
    },
    bounds
  );
}

function eraseObjectAtPoint(
  object: NoteObject,
  point: DrawingPoint,
  hitRadius: number
) {
  if (object.type === "drawing") {
    return eraseDrawingAtPoint(object, point, hitRadius);
  }

  if (object.type === "line") {
    return eraseLineAtPoint(object, point, hitRadius);
  }

  if (
    isVertexShape(object) ||
    object.type === "image" ||
    object.type === "sticker" ||
    object.type === "textbox"
  ) {
    const touched = doesEraserTouchBox(object, point, Math.max(10, hitRadius));

    return {
      changed: touched,
      objects: touched ? [] : [object],
    };
  }

  return { changed: false, objects: [object] };
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

function isRecognizedDrawingShape(object: NoteObject) {
  return (
    object.generatedFromDrawing === true &&
    (isVertexShape(object) || object.type === "line")
  );
}

function canDuplicateObject(object: NoteObject) {
  return (
    isVertexShape(object) ||
    object.type === "line" ||
    object.type === "image" ||
    object.type === "sticker" ||
    object.type === "textbox" ||
    object.type === "drawing"
  );
}

function canSelectObjectInCurrentMode(object: NoteObject, selectionMode: boolean) {
  return !selectionMode && object.type !== "drawing";
}

function canObjectReceivePointerInCurrentMode(
  object: NoteObject,
  selectionMode: boolean,
  drawingMode: boolean
) {
  return canSelectObjectInCurrentMode(object, selectionMode) && !drawingMode;
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
  viewScale = 1,
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
  const straightLineHoldTimerRef = useRef<number | null>(null);
  const straightLineHoldEligibleRef = useRef(false);
  const straightLineConvertedRef = useRef(false);
  const straightLineLastPointRef = useRef<DrawingPoint | null>(null);
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
  const [drawingSelectionMenu, setDrawingSelectionMenu] = useState<
    "actions" | "style" | null
  >(null);
  const [recognizedShapeMenu, setRecognizedShapeMenu] = useState<
    "actions" | "style" | null
  >(null);
  const [cropImageId, setCropImageId] = useState<string | null>(null);
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

  function getLayerPointFromClient(clientX: number, clientY: number) {
    const layerBounds = layerRef.current?.getBoundingClientRect();

    if (!layerBounds) return objectClipboardAnchor;
    const layerScale = getLayerScale(layerBounds);

    return {
      x: clampValue((clientX - layerBounds.left) / layerScale, 0, pageWidth),
      y: clampValue((clientY - layerBounds.top) / layerScale, 0, drawingHeight),
    };
  }

  function getLayerScale(layerBounds?: DOMRect | null) {
    if (layerBounds && layerBounds.width > 0) {
      return layerBounds.width / pageWidth;
    }

    return Math.max(0.01, viewScale);
  }

  function getLayerDelta(deltaX: number, deltaY: number) {
    const layerScale = getLayerScale(layerRef.current?.getBoundingClientRect());

    return {
      dx: deltaX / layerScale,
      dy: deltaY / layerScale,
    };
  }

  function getPointInBounds(
    clientX: number,
    clientY: number,
    bounds: DOMRect
  ) {
    const layerScale = getLayerScale(bounds);

    return {
      x: (clientX - bounds.left) / layerScale,
      y: (clientY - bounds.top) / layerScale,
    };
  }

  useEffect(() => {
    if (objectClipboard.length === 0) return;

    function handlePointerMove(event: PointerEvent) {
      const layerBounds = layerRef.current?.getBoundingClientRect();
      if (!layerBounds) return;
      const point = getPointInBounds(event.clientX, event.clientY, layerBounds);

      setObjectClipboardAnchor({
        x: clampValue(point.x, 0, pageWidth),
        y: clampValue(point.y, 0, drawingHeight),
      });
    }

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [drawingHeight, objectClipboard.length, pageWidth]);

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

  function getImageCrop(object: NoteObject) {
    return {
      left: object.crop?.left ?? 0,
      top: object.crop?.top ?? 0,
      right: object.crop?.right ?? 0,
      bottom: object.crop?.bottom ?? 0,
    };
  }

  function clampCropSide(
    value: number,
    oppositeSide: number
  ) {
    return clampValue(value, 0, Math.max(0, 0.9 - oppositeSide));
  }

  function getCroppedImageStyle(object: NoteObject) {
    const crop = getImageCrop(object);
    const visibleWidth = Math.max(0.1, 1 - crop.left - crop.right);
    const visibleHeight = Math.max(0.1, 1 - crop.top - crop.bottom);

    return {
      left: `${(-crop.left / visibleWidth) * 100}%`,
      top: `${(-crop.top / visibleHeight) * 100}%`,
      width: `${(1 / visibleWidth) * 100}%`,
      height: `${(1 / visibleHeight) * 100}%`,
    };
  }

  function isStylusPointer(event: PointerEvent | React.PointerEvent) {
    if (event.pointerType === "pen") return true;
    if (event.pointerType !== "touch") return false;

    const width = event.width ?? 0;
    const height = event.height ?? 0;
    const pressure = event.pressure ?? 0;

    return pressure > 0 || (width > 0 && height > 0 && width <= 12 && height <= 12);
  }

  function canUsePointerForDrawing(event: PointerEvent | React.PointerEvent) {
    return event.pointerType === "mouse" || isStylusPointer(event);
  }

  function isStylusTouch(touch: Touch) {
    const typedTouch = touch as Touch & {
      altitudeAngle?: number;
      azimuthAngle?: number;
      touchType?: string;
    };
    if (typedTouch.touchType === "stylus") return true;
    if (
      typeof typedTouch.altitudeAngle === "number" ||
      typeof typedTouch.azimuthAngle === "number"
    ) {
      return true;
    }

    const radiusX = touch.radiusX ?? 0;
    const radiusY = touch.radiusY ?? 0;
    const force = touch.force ?? 0;

    if (radiusX > 0 && radiusY > 0 && radiusX <= 12 && radiusY <= 12) return true;
    if (force <= 0) return false;
    if (radiusX === 0 || radiusY === 0) return true;

    return radiusX <= 12 && radiusY <= 12;
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

    const pixelRatio = (window.devicePixelRatio || 1) * Math.max(1, viewScale);
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

  function clearStraightLineHoldTimer() {
    if (straightLineHoldTimerRef.current === null) return;

    window.clearTimeout(straightLineHoldTimerRef.current);
    straightLineHoldTimerRef.current = null;
  }

  function getStrokeBounds(points: DrawingPoint[]) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
      right,
      bottom,
    };
  }

  function getStrokeLength(points: DrawingPoint[]) {
    return points.slice(1).reduce((total, point, index) => {
      const previous = points[index];
      return total + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
  }

  function getMaxDistanceFromSegment(
    points: DrawingPoint[],
    start: DrawingPoint,
    end: DrawingPoint
  ) {
    return points.reduce(
      (maxDistance, point) =>
        Math.max(maxDistance, getDistanceToSegment(point, start, end)),
      0
    );
  }

  function simplifyStrokePoints(
    points: DrawingPoint[],
    tolerance: number
  ): DrawingPoint[] {
    if (points.length <= 2) return points;

    let maxDistance = 0;
    let splitIndex = 0;
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];

    for (let index = 1; index < points.length - 1; index += 1) {
      const distance = getDistanceToSegment(
        points[index],
        firstPoint,
        lastPoint
      );

      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = index;
      }
    }

    if (maxDistance <= tolerance) {
      return [firstPoint, lastPoint];
    }

    const left: DrawingPoint[] = simplifyStrokePoints(
      points.slice(0, splitIndex + 1),
      tolerance
    );
    const right: DrawingPoint[] = simplifyStrokePoints(
      points.slice(splitIndex),
      tolerance
    );

    return [...left.slice(0, -1), ...right];
  }

  function getShapeBaseFromStroke(points: DrawingPoint[]) {
    const bounds = getStrokeBounds(points);
    const padding = Math.max(4, drawingStrokeWidthRef.current / 2);
    const left = clampValue(bounds.left - padding, 0, pageWidth);
    const top = clampValue(bounds.top - padding, 0, drawingHeight);
    const right = clampValue(bounds.right + padding, 0, pageWidth);
    const bottom = clampValue(bounds.bottom + padding, 0, drawingHeight);

    return {
      x: left,
      y: top,
      width: Math.max(8, right - left),
      height: Math.max(8, bottom - top),
    };
  }

  function getSquareLikeBase(base: { x: number; y: number; width: number; height: number }) {
    const size = Math.min(Math.max(base.width, base.height), pageWidth, drawingHeight);
    const centerX = base.x + base.width / 2;
    const centerY = base.y + base.height / 2;

    return {
      x: clampValue(centerX - size / 2, 0, Math.max(0, pageWidth - size)),
      y: clampValue(centerY - size / 2, 0, Math.max(0, drawingHeight - size)),
      width: size,
      height: size,
    };
  }

  function shouldSnapToSquare(base: { width: number; height: number }) {
    const aspectRatio = base.width / Math.max(1, base.height);
    return aspectRatio >= 0.82 && aspectRatio <= 1.22;
  }

  function getVertexAngle(
    previous: ShapeVertex,
    current: ShapeVertex,
    next: ShapeVertex
  ) {
    const ax = previous.x - current.x;
    const ay = previous.y - current.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const lengthA = Math.hypot(ax, ay);
    const lengthB = Math.hypot(bx, by);

    if (lengthA === 0 || lengthB === 0) return 180;

    const cosine = clampValue(
      (ax * bx + ay * by) / (lengthA * lengthB),
      -1,
      1
    );
    return (Math.acos(cosine) * 180) / Math.PI;
  }

  function removeNearCollinearVertices(vertices: ShapeVertex[]) {
    if (vertices.length <= 3) return vertices;

    return vertices.filter((vertex, index) => {
      const previous = vertices[(index - 1 + vertices.length) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const angle = getVertexAngle(previous, vertex, next);
      return Math.abs(180 - angle) > 16;
    });
  }

  function isRectangleLikeShape(
    vertices: ShapeVertex[],
    base: { width: number; height: number }
  ) {
    if (vertices.length !== 4 || base.width < 12 || base.height < 12) {
      return false;
    }

    const anglesLookRectangular = vertices.every((vertex, index) => {
      const previous = vertices[(index - 1 + vertices.length) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const angle = getVertexAngle(previous, vertex, next);
      return angle >= 65 && angle <= 115;
    });

    if (!anglesLookRectangular) return false;

    const expectedCorners = [
      { x: 0, y: 0 },
      { x: base.width, y: 0 },
      { x: base.width, y: base.height },
      { x: 0, y: base.height },
    ];
    const availableCorners = [...expectedCorners];
    const cornerTolerance = Math.max(
      16,
      Math.hypot(base.width, base.height) * 0.18
    );

    return vertices.every((vertex) => {
      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      availableCorners.forEach((corner, index) => {
        const distance = Math.hypot(vertex.x - corner.x, vertex.y - corner.y);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      if (closestIndex === -1 || closestDistance > cornerTolerance) {
        return false;
      }

      availableCorners.splice(closestIndex, 1);
      return true;
    });
  }

  function createRecognizedStrokeObject(points: DrawingPoint[]): NoteObject | null {
    if (points.length < 2) return null;

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    const bounds = getStrokeBounds(points);
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const strokeLength = getStrokeLength(points);
    const endDistance = Math.hypot(
      lastPoint.x - firstPoint.x,
      lastPoint.y - firstPoint.y
    );
    const isClosed = endDistance <= Math.max(28, diagonal * 0.22);
    const maxLineDistance = getMaxDistanceFromSegment(
      points,
      firstPoint,
      lastPoint
    );

    if (
      endDistance >= 24 &&
      (strokeLength <= endDistance * 1.22 ||
        maxLineDistance <= Math.max(10, drawingStrokeWidthRef.current * 2.4))
    ) {
      return {
        id: crypto.randomUUID(),
        type: "line" as const,
        x: clampValue(firstPoint.x, 0, pageWidth),
        y: clampValue(firstPoint.y, 0, drawingHeight),
        endX: clampValue(lastPoint.x, 0, pageWidth),
        endY: clampValue(lastPoint.y, 0, drawingHeight),
        width: Math.max(1, Math.abs(lastPoint.x - firstPoint.x)),
        height: Math.max(1, Math.abs(lastPoint.y - firstPoint.y)),
        color: drawingColorRef.current,
        strokeWidth: drawingStrokeWidthRef.current,
        generatedFromDrawing: true,
        flipX: false,
        flipY: false,
      };
    }

    if (!isClosed || diagonal < 28) return null;

    const base = getShapeBaseFromStroke(points);
    const tolerance = Math.max(8, diagonal * 0.045);
    let simplified = simplifyStrokePoints(points, tolerance);
    simplified = simplified.filter((point, index) => {
      if (index === 0) return true;
      const previous = simplified[index - 1];
      return Math.hypot(point.x - previous.x, point.y - previous.y) > 8;
    });

    if (
      simplified.length > 2 &&
      Math.hypot(
        simplified[0].x - simplified[simplified.length - 1].x,
        simplified[0].y - simplified[simplified.length - 1].y
      ) <= Math.max(18, diagonal * 0.12)
    ) {
      simplified = simplified.slice(0, -1);
    }

    const center = {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
    const ellipseDistances = points.map((point) => {
      const normalizedX = (point.x - center.x) / Math.max(1, bounds.width / 2);
      const normalizedY = (point.y - center.y) / Math.max(1, bounds.height / 2);
      return Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    });
    const ellipseError =
      ellipseDistances.reduce(
        (total, distance) => total + Math.abs(distance - 1),
        0
      ) / Math.max(1, ellipseDistances.length);

    if (ellipseError <= 0.2 && simplified.length > 5) {
      const ellipseBase = shouldSnapToSquare(base) ? getSquareLikeBase(base) : base;

      return {
        id: crypto.randomUUID(),
        type: "circle" as const,
        x: ellipseBase.x,
        y: ellipseBase.y,
        width: ellipseBase.width,
        height: ellipseBase.height,
        color: drawingColorRef.current,
        strokeWidth: drawingStrokeWidthRef.current,
        generatedFromDrawing: true,
        filled: false,
        flipX: false,
        flipY: false,
      };
    }

    const vertices = removeNearCollinearVertices(
      simplified
      .slice(0, 10)
      .map((point) => ({
        x: clampValue(point.x - base.x, 0, base.width),
        y: clampValue(point.y - base.y, 0, base.height),
      }))
    );

    if (vertices.length === 3) {
      return {
        id: crypto.randomUUID(),
        type: "triangle" as const,
        ...base,
        vertices,
        color: drawingColorRef.current,
        strokeWidth: drawingStrokeWidthRef.current,
        generatedFromDrawing: true,
        filled: false,
        flipX: false,
        flipY: false,
      };
    }

    if (vertices.length >= 4 && vertices.length <= 6) {
      if (!isRectangleLikeShape(vertices, base)) {
        return {
          id: crypto.randomUUID(),
          type: "rectangle" as const,
          ...base,
          vertices,
          color: drawingColorRef.current,
          strokeWidth: drawingStrokeWidthRef.current,
          generatedFromDrawing: true,
          filled: false,
          flipX: false,
          flipY: false,
        };
      }

      const rectangleBase = shouldSnapToSquare(base)
        ? getSquareLikeBase(base)
        : {
            x: base.x,
            y: base.y,
            width: base.width,
            height: base.height,
          };

      return {
        id: crypto.randomUUID(),
        type: "rectangle" as const,
        x: rectangleBase.x,
        y: rectangleBase.y,
        width: rectangleBase.width,
        height: rectangleBase.height,
        vertices: [
          { x: 0, y: 0 },
          { x: rectangleBase.width, y: 0 },
          { x: rectangleBase.width, y: rectangleBase.height },
          { x: 0, y: rectangleBase.height },
        ],
        color: drawingColorRef.current,
        strokeWidth: drawingStrokeWidthRef.current,
        generatedFromDrawing: true,
        filled: false,
        flipX: false,
        flipY: false,
      };
    }

    if (vertices.length >= 3) {
      return {
        id: crypto.randomUUID(),
        type: "rectangle" as const,
        ...base,
        vertices,
        color: drawingColorRef.current,
        strokeWidth: drawingStrokeWidthRef.current,
        generatedFromDrawing: true,
        filled: false,
        flipX: false,
        flipY: false,
      };
    }

    return null;
  }

  function convertActiveDrawingToRecognizedShape() {
    if (
      !straightLineHoldEligibleRef.current ||
      straightLineConvertedRef.current ||
      drawingToolRef.current !== "draw"
    ) {
      return;
    }

    const points = activeDrawingPointsRef.current;
    if (points.length < 2) return;

    const recognizedObject = createRecognizedStrokeObject(points);
    if (!recognizedObject) return;

    straightLineConvertedRef.current = true;
    activeDrawingPointsRef.current = [];
    setActiveDrawingPoints([]);
    clearLiveDrawingCanvas();
    clearStraightLineHoldTimer();

    const nextObjects = [...objectsRef.current, recognizedObject];
    objectsRef.current = nextObjects;
    onChangeObjectsRef.current(nextObjects);
    onSelectionChangeRef.current(
      recognizedObject.type === "line" ? [] : [recognizedObject.id]
    );
    setRecognizedShapeMenu(null);
  }

  function scheduleStraightLineHold(point: DrawingPoint) {
    if (!straightLineHoldEligibleRef.current || drawingToolRef.current !== "draw") {
      return;
    }

    clearStraightLineHoldTimer();
    straightLineLastPointRef.current = point;
    straightLineHoldTimerRef.current = window.setTimeout(() => {
      const lastPoint = activeDrawingPointsRef.current.at(-1);
      const holdPoint = straightLineLastPointRef.current;
      if (!lastPoint || !holdPoint) return;

      const hasStayedStill =
        Math.hypot(lastPoint.x - holdPoint.x, lastPoint.y - holdPoint.y) <= 3;

      if (hasStayedStill) {
        convertActiveDrawingToRecognizedShape();
      }
    }, 560);
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

  function commitPendingDrawingsToObjects() {
    const drawingsToCommit = pendingDrawingsRef.current;
    if (drawingsToCommit.length === 0) {
      return objectsRef.current;
    }

    const nextObjects = [...objectsRef.current, ...drawingsToCommit];
    objectsRef.current = nextObjects;
    onChangeObjectsRef.current(nextObjects);
    replacePendingDrawings([]);
    pendingDrawingUndoStackRef.current = [];
    pendingDrawingRedoStackRef.current = [];

    return nextObjects;
  }

  function commitDrawingPoints(finalPoints: DrawingPoint[]) {
    clearStraightLineHoldTimer();
    if (straightLineConvertedRef.current) {
      straightLineConvertedRef.current = false;
      straightLineHoldEligibleRef.current = false;
      straightLineLastPointRef.current = null;
      clearLiveDrawingCanvas();
      return;
    }

    if (finalPoints.length < 2) {
      onSelectionChangeRef.current([]);
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
    return canUsePointerForDrawing(event);
  }

  function addLiveCanvasPoint(nextPoint: DrawingPoint) {
    if (straightLineConvertedRef.current) return;
    if (!isPointInsidePaper(nextPoint)) return;

    const context = prepareLiveDrawingCanvas();
    if (!context) return;

    const points = activeDrawingPointsRef.current;
    const previousPoint = points[points.length - 1];

    if (!previousPoint) {
      points.push(nextPoint);
      scheduleStraightLineHold(nextPoint);
      scheduleActiveDrawingPaint();
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
    scheduleStraightLineHold(nextPoint);
    scheduleActiveDrawingPaint();
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
      clearStraightLineHoldTimer();
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
    if (!selectionMode) return;

    commitPendingDrawingsToObjects();

    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      activeElement.matches("[data-textbox-editor]")
    ) {
      activeElement.blur();
    }

    savedTextSelectionRef.current = null;
    // This effect should run only when selection mode opens. The helper reads
    // the latest objects/drawings through refs so fast Pencil strokes do not
    // force this effect to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionMode]);

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
      const canvasScale = canvasBounds.width / pageWidth || Math.max(0.01, viewScale);

      return {
        x: (clientX - canvasBounds.left) / canvasScale,
        y: (clientY - canvasBounds.top) / canvasScale,
      };
    }

    function beginCanvasStroke(
      id: number,
      point: DrawingPoint,
      canStraighten: boolean
    ) {
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
      straightLineHoldEligibleRef.current =
        canStraighten && drawingToolRef.current === "draw";
      straightLineConvertedRef.current = false;
      straightLineLastPointRef.current = null;
      clearStraightLineHoldTimer();
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
      setActiveDrawingPoints([]);
    }

    function handlePointerDown(event: PointerEvent) {

      if (!isDrawingPointer(event)) {
        if (event.pointerType === "touch") {
          onSelectionChangeRef.current([]);
        }
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
        getCanvasPoint(event.clientX, event.clientY),
        event.pointerType === "pen"
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

      if (
        canvasDrawingPointerIdRef.current !== null ||
        activeDrawingPointerIdRef.current !== null
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
        getCanvasPoint(touch.clientX, touch.clientY),
        true
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
  }, [drawingMode, drawingTool, viewScale]);

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

  function updateSelectedDrawingObjects(updates: Partial<NoteObject>) {
    const selectedIds = new Set(selectedObjectIds);

    onChangeObjects(
      objects.map((object) =>
        selectedIds.has(object.id) && object.type === "drawing"
          ? { ...object, ...updates }
          : object
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

  function cloneObjectsAtPoint(
    sourceObjects: NoteObject[],
    point: DrawingPoint
  ) {
    if (!sourceObjects.length) return [];

    const sourceBounds = sourceObjects.map(getObjectBounds);
    const left = Math.min(...sourceBounds.map((box) => box.left));
    const top = Math.min(...sourceBounds.map((box) => box.top));
    const right = Math.max(...sourceBounds.map((box) => box.left + box.width));
    const bottom = Math.max(...sourceBounds.map((box) => box.top + box.height));
    const bounds = {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
    const moveDelta = clampMoveDelta(
      bounds,
      point.x - bounds.left,
      point.y - bounds.top
    );

    return sourceObjects.map((object, index) => {
      const duplicateId = getDuplicateId(object, index);

      if (object.type === "line") {
        const points = getLinePoints(object);

        return {
          ...object,
          id: duplicateId,
          x: points.startX + moveDelta.dx,
          y: points.startY + moveDelta.dy,
          endX: points.endX + moveDelta.dx,
          endY: points.endY + moveDelta.dy,
        };
      }

      return {
        ...object,
        id: duplicateId,
        ...clampPosition(
          object.x + moveDelta.dx,
          object.y + moveDelta.dy,
          object.width,
          object.height
        ),
      };
    });
  }

  async function duplicateImageSourcesForPaste(sourceObjects: NoteObject[]) {
    return Promise.all(
      sourceObjects.map(async (object) => {
        if (object.type !== "image" || !object.src) return object;

        try {
          return {
            ...object,
            src: await duplicateStoredImage(object.src),
          };
        } catch {
          return object;
        }
      })
    );
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

  async function pasteObjectClipboard(pastePoint?: DrawingPoint | null) {
    if (!objectClipboard.length) return;

    const clipboardObjects = await duplicateImageSourcesForPaste(objectClipboard);
    const targetPoint = pastePoint ?? objectClipboardAnchor;
    const pastedObjects = targetPoint
      ? cloneObjectsAtPoint(clipboardObjects, targetPoint)
      : cloneObjectsWithOffset(clipboardObjects, 24);
    onChangeObjects([...objects, ...pastedObjects]);
    onSelectionChange(pastedObjects.map((object) => object.id));

    setObjectClipboardAnchor(null);
    setObjectClipboard([]);
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
    const selectedImage =
      selectedObjectIds.length === 1
        ? objects.find(
            (object) =>
              object.id === selectedObjectIds[0] && object.type === "image"
          )
        : undefined;

    return (
      <div className={objectControlPanelClass}>
        {renderMoveActionButton()}
        {selectedImage && (
          <button
            type="button"
            className={`${objectControlButtonClass} text-left`}
            title="Crop image"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setCropImageId((current) =>
                current === selectedImage.id ? null : selectedImage.id
              );
            }}
          >
            Crop
          </button>
        )}
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
            (event) =>
              pasteObjectClipboard(
                getLayerPointFromClient(event.clientX, event.clientY)
              )
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
    action: (event: React.MouseEvent<HTMLButtonElement>) => void
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
          action(event);
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

      const layerDelta = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );
      const moveDelta = clampMoveDelta(
        movingBounds,
        layerDelta.dx,
        layerDelta.dy
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

      const { dx, dy } = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );

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

  function startRecognizedShapeResize(
    event: React.PointerEvent<HTMLDivElement>,
    object: NoteObject
  ) {
    const originalBounds = getObjectBounds(object);
    if (originalBounds.width <= 0 || originalBounds.height <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    onSelectionChange([object.id]);

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const originalVertices = isVertexShape(object)
      ? getShapeVertices(object)
      : null;
    const originalLinePoints =
      object.type === "line" ? getLinePoints(object) : null;

    function getScaledValue(value: number, origin: number, scale: number) {
      return origin + (value - origin) * scale;
    }

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const { dx, dy } = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );
      const scale = Math.max(
        0.2,
        1 +
          Math.max(
            dx / Math.max(1, originalBounds.width),
            dy / Math.max(1, originalBounds.height)
          )
      );

      if (originalLinePoints) {
        const startX = getScaledValue(
          originalLinePoints.startX,
          originalBounds.left,
          scale
        );
        const startY = getScaledValue(
          originalLinePoints.startY,
          originalBounds.top,
          scale
        );
        const endX = getScaledValue(
          originalLinePoints.endX,
          originalBounds.left,
          scale
        );
        const endY = getScaledValue(
          originalLinePoints.endY,
          originalBounds.top,
          scale
        );

        updateObject(object.id, {
          x: clampValue(startX, 0, pageWidth),
          y: clampValue(startY, 0, drawingHeight),
          endX: clampValue(endX, 0, pageWidth),
          endY: clampValue(endY, 0, drawingHeight),
          width: Math.max(1, Math.abs(endX - startX)),
          height: Math.max(1, Math.abs(endY - startY)),
        });
        return;
      }

      const nextWidth = Math.min(
        Math.max(30, object.width * scale),
        Math.max(1, pageWidth - object.x)
      );
      const nextHeight = Math.min(
        Math.max(30, object.height * scale),
        Math.max(1, drawingHeight - object.y)
      );

      updateObject(object.id, {
        width: nextWidth,
        height: nextHeight,
        ...(originalVertices
          ? {
              vertices: originalVertices.map((vertex) => ({
                x: (vertex.x / Math.max(1, object.width)) * nextWidth,
                y: (vertex.y / Math.max(1, object.height)) * nextHeight,
              })),
            }
          : {}),
      });
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  function startGroupResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!selectedGroupBounds) return;

    event.preventDefault();
    event.stopPropagation();

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const originalBounds = selectedGroupBounds;
    const selectedIds = new Set(selectedObjectIds);
    const originalObjects = new Map(
      objects
        .filter((object) => selectedIds.has(object.id))
        .map((object) => [object.id, object])
    );

    function getScaledValue(value: number, origin: number, scale: number) {
      return origin + (value - origin) * scale;
    }

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const { dx, dy } = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );
      const rawScale = Math.max(
        0.2,
        1 +
          Math.max(
            dx / Math.max(1, originalBounds.width),
            dy / Math.max(1, originalBounds.height)
          )
      );
      const maxScale = Math.max(
        0.2,
        Math.min(
          pageWidth / Math.max(1, originalBounds.left + originalBounds.width),
          drawingHeight /
            Math.max(1, originalBounds.top + originalBounds.height)
        )
      );
      const scale = Math.min(rawScale, maxScale);

      onChangeObjects(
        objects.map((object) => {
          const original = originalObjects.get(object.id);
          if (!original) return object;

          if (original.type === "line") {
            const points = getLinePoints(original);
            return {
              ...object,
              x: getScaledValue(points.startX, originalBounds.left, scale),
              y: getScaledValue(points.startY, originalBounds.top, scale),
              endX: getScaledValue(points.endX, originalBounds.left, scale),
              endY: getScaledValue(points.endY, originalBounds.top, scale),
              strokeWidth: Math.max(
                1,
                (original.strokeWidth ?? 5) * Math.sqrt(scale)
              ),
            };
          }

          const nextWidth = Math.max(1, original.width * scale);
          const nextHeight = Math.max(1, original.height * scale);

          return {
            ...object,
            x: getScaledValue(original.x, originalBounds.left, scale),
            y: getScaledValue(original.y, originalBounds.top, scale),
            width: nextWidth,
            height: nextHeight,
            fontSize:
              original.type === "textbox" && original.fontSize
                ? Math.max(8, original.fontSize * Math.sqrt(scale))
                : original.fontSize,
            vertices: original.vertices?.map((vertex) => ({
              x: vertex.x * scale,
              y: vertex.y * scale,
            })),
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

  function startRotate(
    event: React.PointerEvent<HTMLDivElement>,
    object: NoteObject
  ) {
    event.preventDefault();
    event.stopPropagation();
    onSelectionChange([object.id]);

    const linePointsForCenter =
      object.type === "line" ? getLinePoints(object) : null;
    const centerX = linePointsForCenter
      ? (linePointsForCenter.startX + linePointsForCenter.endX) / 2
      : object.x + object.width / 2;
    const centerY = linePointsForCenter
      ? (linePointsForCenter.startY + linePointsForCenter.endY) / 2
      : object.y + object.height / 2;
    const startPoint = getLayerPointFromClient(event.clientX, event.clientY);
    if (!startPoint) return;

    const startAngle =
      Math.atan2(startPoint.y - centerY, startPoint.x - centerX) * (180 / Math.PI);
    const originalRotation = object.rotation ?? 0;
    const originalLinePoints = linePointsForCenter;

    function rotateLinePoint(point: DrawingPoint, degrees: number) {
      const radians = degrees * (Math.PI / 180);
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const dx = point.x - centerX;
      const dy = point.y - centerY;

      return {
        x: centerX + dx * cos - dy * sin,
        y: centerY + dx * sin + dy * cos,
      };
    }

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const currentPoint = getLayerPointFromClient(
        moveEvent.clientX,
        moveEvent.clientY
      );
      if (!currentPoint) return;

      const currentAngle =
        Math.atan2(currentPoint.y - centerY, currentPoint.x - centerX) *
        (180 / Math.PI);
      const nextRotation = (originalRotation + currentAngle - startAngle) % 360;

      if (originalLinePoints) {
        const deltaRotation = currentAngle - startAngle;
        const nextStart = rotateLinePoint(
          { x: originalLinePoints.startX, y: originalLinePoints.startY },
          deltaRotation
        );
        const nextEnd = rotateLinePoint(
          { x: originalLinePoints.endX, y: originalLinePoints.endY },
          deltaRotation
        );

        updateObject(object.id, {
          x: clampValue(nextStart.x, 0, pageWidth),
          y: clampValue(nextStart.y, 0, drawingHeight),
          endX: clampValue(nextEnd.x, 0, pageWidth),
          endY: clampValue(nextEnd.y, 0, drawingHeight),
          width: Math.max(1, Math.abs(nextEnd.x - nextStart.x)),
          height: Math.max(1, Math.abs(nextEnd.y - nextStart.y)),
        });
        return;
      }

      updateObject(object.id, {
        rotation: Math.round(nextRotation),
      });
    }

    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startImageCrop(
    event: React.PointerEvent<HTMLDivElement>,
    object: NoteObject,
    side: "left" | "right" | "top" | "bottom"
  ) {
    event.preventDefault();
    event.stopPropagation();

    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const originalCrop = getImageCrop(object);
    const visibleWidth = Math.max(
      0.1,
      1 - originalCrop.left - originalCrop.right
    );
    const visibleHeight = Math.max(
      0.1,
      1 - originalCrop.top - originalCrop.bottom
    );
    const fullImageWidth = object.width / visibleWidth;
    const fullImageHeight = object.height / visibleHeight;
    const minVisibleWidth = Math.min(24, Math.max(1, fullImageWidth * 0.25));
    const minVisibleHeight = Math.min(24, Math.max(1, fullImageHeight * 0.25));

    function handleMove(moveEvent: PointerEvent) {
      moveEvent.preventDefault();

      const { dx: rawDx, dy: rawDy } = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );
      const nextCrop = { ...originalCrop };
      let nextX = object.x;
      let nextY = object.y;
      let nextWidth = object.width;
      let nextHeight = object.height;

      if (side === "left") {
        const maxDx =
          (1 -
            originalCrop.right -
            minVisibleWidth / fullImageWidth -
            originalCrop.left) *
          fullImageWidth;
        const minDx = Math.max(-originalCrop.left * fullImageWidth, -object.x);
        const dx = clampValue(rawDx, minDx, maxDx);

        nextCrop.left = clampCropSide(
          originalCrop.left + dx / fullImageWidth,
          originalCrop.right
        );
        nextX = object.x + dx;
        nextWidth = object.width - dx;
      }

      if (side === "right") {
        const minDx =
          -(
            1 -
            originalCrop.left -
            minVisibleWidth / fullImageWidth -
            originalCrop.right
          ) * fullImageWidth;
        const maxDx = Math.min(
          originalCrop.right * fullImageWidth,
          pageWidth - (object.x + object.width)
        );
        const dx = clampValue(rawDx, minDx, maxDx);

        nextCrop.right = clampCropSide(
          originalCrop.right - dx / fullImageWidth,
          originalCrop.left
        );
        nextWidth = object.width + dx;
      }

      if (side === "top") {
        const maxDy =
          (1 -
            originalCrop.bottom -
            minVisibleHeight / fullImageHeight -
            originalCrop.top) *
          fullImageHeight;
        const minDy = Math.max(-originalCrop.top * fullImageHeight, -object.y);
        const dy = clampValue(rawDy, minDy, maxDy);

        nextCrop.top = clampCropSide(
          originalCrop.top + dy / fullImageHeight,
          originalCrop.bottom
        );
        nextY = object.y + dy;
        nextHeight = object.height - dy;
      }

      if (side === "bottom") {
        const minDy =
          -(
            1 -
            originalCrop.top -
            minVisibleHeight / fullImageHeight -
            originalCrop.bottom
          ) * fullImageHeight;
        const maxDy = Math.min(
          originalCrop.bottom * fullImageHeight,
          drawingHeight - (object.y + object.height)
        );
        const dy = clampValue(rawDy, minDy, maxDy);

        nextCrop.bottom = clampCropSide(
          originalCrop.bottom - dy / fullImageHeight,
          originalCrop.top
        );
        nextHeight = object.height + dy;
      }

      updateObject(object.id, {
        x: nextX,
        y: nextY,
        width: Math.max(1, nextWidth),
        height: Math.max(1, nextHeight),
        crop: nextCrop,
      });
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

      const { dx, dy } = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );

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
    onSelectionChangeRef.current([]);
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
        const result = eraseObjectAtPoint(object, point, eraserRadius);
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
    onSelectionChangeRef.current([]);
    event.currentTarget.setPointerCapture(event.pointerId);

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;
    const erasingElement = event.currentTarget;
    const pointerId = event.pointerId;

    const getPoint = (pointerEvent: PointerEvent | React.PointerEvent) =>
      getPointInBounds(pointerEvent.clientX, pointerEvent.clientY, layerBounds);

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

    return getPointInBounds(pointerEvent.clientX, pointerEvent.clientY, layerBounds);
  }

  function addActiveDrawingPoint(nextPoint: DrawingPoint) {
    if (straightLineConvertedRef.current) return;
    if (!isPointInsidePaper(nextPoint)) return;

    const points = activeDrawingPointsRef.current;
    const lastPoint = points[points.length - 1];

    if (!lastPoint) {
      points.push(nextPoint);
      scheduleStraightLineHold(nextPoint);
      return;
    }

    const distance = Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y);

    if (distance < activeDrawingMinDistanceRef.current) return;

    points.push(nextPoint);
    scheduleStraightLineHold(nextPoint);
  }

  function finishActiveDrawing(pointerId: number) {
    if (activeDrawingPointerIdRef.current !== pointerId) return;

    activeDrawingPointerIdRef.current = null;
    activeDrawingBoundsRef.current = null;
    clearStraightLineHoldTimer();

    if (activeDrawingFrameRef.current !== null) {
      window.cancelAnimationFrame(activeDrawingFrameRef.current);
      activeDrawingFrameRef.current = null;
    }

    const finalPoints = [...activeDrawingPointsRef.current];
    activeDrawingPointsRef.current = [];
    setActiveDrawingPoints([]);

    if (straightLineConvertedRef.current) {
      straightLineConvertedRef.current = false;
      straightLineHoldEligibleRef.current = false;
      straightLineLastPointRef.current = null;
      return;
    }

    if (finalPoints.length < 2) {
      onSelectionChange([]);
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
  }

  function startDrawingStroke(
    pointerId: number,
    firstPoint: DrawingPoint,
    minPointDistance: number,
    canStraighten = false
  ) {
    if (!isPointInsidePaper(firstPoint)) {
      return;
    }

    if (activeDrawingPointerIdRef.current !== null) {
      finishActiveDrawing(activeDrawingPointerIdRef.current);
    }

    activeDrawingPointerIdRef.current = pointerId;
    activeDrawingMinDistanceRef.current = minPointDistance;
    straightLineHoldEligibleRef.current =
      canStraighten && drawingToolRef.current === "draw";
    straightLineConvertedRef.current = false;
    straightLineLastPointRef.current = null;
    clearStraightLineHoldTimer();
    activeDrawingPointsRef.current = [firstPoint];
    scheduleStraightLineHold(firstPoint);
    setActiveDrawingPoints([firstPoint]);
    onSelectionChange([]);
  }

  function startDrawing(event: PointerEvent) {
    if (!drawingModeRef.current || drawingToolRef.current === "erase") return;
    if (!canUsePointerForDrawing(event)) return;
    if (
      event.pointerType !== "pen" &&
      Date.now() < suppressPointerDrawingUntilRef.current
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;

    activeDrawingBoundsRef.current = layerBounds;

    const firstPoint = getPointInBounds(event.clientX, event.clientY, layerBounds);

    startDrawingStroke(
      event.pointerId,
      firstPoint,
      event.pointerType === "pen" ? 0.1 : 1,
      event.pointerType === "pen"
    );
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

    function handleGestureTouchStart() {
      tabletGestureRef.current = null;
    }

    function handleGestureTouchMove(event: TouchEvent) {
      if (event.defaultPrevented) {
        tabletGestureRef.current = null;
        return;
      }

      const gesture = tabletGestureRef.current;
      if (!gesture) return;

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

      tabletGestureRef.current = null;

      const duration = Date.now() - gesture.startTime;
      if (duration > 420 || gesture.maxDistance > 28) return;

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

      return getPointInBounds(touch.clientX, touch.clientY, layerBounds);
    }

    function getLayerTouchPoint(touch: Touch) {
      const layerBounds = layerRef.current?.getBoundingClientRect();
      if (!layerBounds) return null;

      return getPointInBounds(touch.clientX, touch.clientY, layerBounds);
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
        getPointInBounds(touch.clientX, touch.clientY, layerBounds),
        0.1,
        true
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
      const { dx, dy } = getLayerDelta(
        moveEvent.clientX - pointerX,
        moveEvent.clientY - pointerY
      );

      const movedVertices = absoluteVertices.map((vertex, index) =>
        index === vertexIndex
          ? {
              x: clampValue(vertex.x + dx, 0, pageWidth),
              y: clampValue(
                vertex.y + dy,
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
    if (event.pointerType === "touch") return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    commitPendingDrawingsToObjects();

    const layerBounds = layerRef.current?.getBoundingClientRect();
    if (!layerBounds) return;

    const selectionBounds = layerBounds;
    const selectionElement = event.currentTarget;
    const pointerId = event.pointerId;
    const startPoint = getPointInBounds(event.clientX, event.clientY, selectionBounds);
    const startX = clampValue(startPoint.x, 0, pageWidth);
    const startY = clampValue(startPoint.y, 0, drawingHeight);
    onSelectionChange([]);
    setSelectionPath([]);
    setDrawingSelectionMenu(null);

    if (selectionTool === "lasso") {
      const firstPoint = { x: startX, y: startY };
      let pathPoints = [firstPoint];
      setSelectionPath(pathPoints);

      function handleLassoMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== pointerId) return;

        moveEvent.preventDefault();
        moveEvent.stopPropagation();

        const rawNextPoint = getPointInBounds(
          moveEvent.clientX,
          moveEvent.clientY,
          selectionBounds
        );
        const nextPoint = {
          x: clampValue(rawNextPoint.x, 0, pageWidth),
          y: clampValue(rawNextPoint.y, 0, drawingHeight),
        };
        const lastPoint = pathPoints[pathPoints.length - 1];

        if (Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y) < 4) {
          return;
        }

        pathPoints = [...pathPoints, nextPoint];
        setSelectionPath(pathPoints);

        if (pathPoints.length >= 3) {
          onSelectionChange(
            objectsRef.current
              .filter((object) =>
                doesPolygonSelectBox(pathPoints, getObjectBounds(object))
              )
              .map((object) => object.id)
          );
        }
      }

      function handleLassoUp() {
        if (selectionElement.hasPointerCapture?.(pointerId)) {
          selectionElement.releasePointerCapture?.(pointerId);
        }

        setSelectionPath([]);
        window.removeEventListener("pointermove", handleLassoMove);
        window.removeEventListener("pointerup", handleLassoUp);
        window.removeEventListener("pointercancel", handleLassoUp);
      }

      window.addEventListener("pointermove", handleLassoMove, { passive: false });
      window.addEventListener("pointerup", handleLassoUp);
      window.addEventListener("pointercancel", handleLassoUp);
      return;
    }

    function handleMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;

      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      const currentPoint = getPointInBounds(
        moveEvent.clientX,
        moveEvent.clientY,
        selectionBounds
      );
      const currentX = clampValue(currentPoint.x, 0, pageWidth);
      const currentY = clampValue(currentPoint.y, 0, drawingHeight);
      const box = {
        left: Math.min(startX, currentX),
        top: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
      };

      setSelectionBox(box);
      onSelectionChange(
        objectsRef.current
          .filter((object) => boxesIntersect(box, getObjectBounds(object)))
          .map((object) => object.id)
      );
    }

    function handleUp() {
      if (selectionElement.hasPointerCapture?.(pointerId)) {
        selectionElement.releasePointerCapture?.(pointerId);
      }

      setSelectionBox(null);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  const hasSingleSelection = selectedObjectIds.length === 1;
  const hasGroupSelection = selectedObjectIds.length > 1;
  const selectedGroupBounds = hasGroupSelection
    ? getSelectionBounds(selectedObjectIds)
    : null;
  const shouldLockEraserScroll =
    isEraserScrollLocked && drawingMode && drawingTool === "erase";
  const isPasteMode = objectClipboard.length > 0;
  const canShowSelectionControls = !drawingMode;
  const canDuplicateGroupSelection = objects.some(
    (object) =>
      selectedObjectIds.includes(object.id) && canDuplicateObject(object)
  );
  const selectedDrawingObjects = objects.filter(
    (object) =>
      selectedObjectIds.includes(object.id) && object.type === "drawing"
  );
  const hasDrawingOnlySelection =
    selectedDrawingObjects.length > 0 &&
    selectedDrawingObjects.length === selectedObjectIds.length;
  const drawingSelectionBounds = hasDrawingOnlySelection
    ? getSelectionBounds(selectedDrawingObjects.map((object) => object.id))
    : null;
  const drawingSelectionThicknesses = selectedDrawingObjects.map(
    (object) => object.strokeWidth ?? 4
  );
  const drawingSelectionThickness =
    drawingSelectionThicknesses.length > 0 &&
    drawingSelectionThicknesses.every(
      (value) => value === drawingSelectionThicknesses[0]
    )
      ? drawingSelectionThicknesses[0]
      : 4;
  const drawingSelectionThicknessLabel =
    drawingSelectionThicknesses.length > 0 &&
    drawingSelectionThicknesses.every(
      (value) => value === drawingSelectionThicknesses[0]
    )
      ? `${drawingSelectionThicknesses[0]}px`
      : "-";
  const drawingSelectionColor = selectedDrawingObjects[0]?.color ?? "#111827";
  const selectedRecognizedShape =
    selectedObjectIds.length === 1
      ? objects.find(
          (object) =>
            object.id === selectedObjectIds[0] &&
            isRecognizedDrawingShape(object) &&
            object.type !== "line"
        )
      : undefined;
  const selectedRecognizedShapeBounds = selectedRecognizedShape
    ? getObjectBounds(selectedRecognizedShape)
    : null;

  return (
    <div
      ref={layerRef}
      className={
        selectionMode || drawingMode || isPasteMode
          ? `pointer-events-auto absolute inset-0 z-20 select-none ${
              drawingMode && drawingTool === "erase"
                ? "cursor-cell"
                : isPasteMode && !drawingMode && !selectionMode
                  ? "cursor-copy"
                  : "cursor-crosshair"
            }`
          : "pointer-events-none absolute inset-0 z-20"
      }
      style={{
        touchAction:
          shouldLockEraserScroll || selectionMode ? "none" : "pan-y",
        WebkitUserSelect: drawingMode || selectionMode ? "none" : undefined,
        userSelect: drawingMode || selectionMode ? "none" : undefined,
        WebkitTouchCallout: drawingMode || selectionMode ? "none" : undefined,
        overscrollBehavior: shouldLockEraserScroll || selectionMode ? "none" : "auto",
      }}
      onPointerDown={(event) => {
        if (isPasteMode && !drawingMode && !selectionMode) {
          event.preventDefault();
          event.stopPropagation();
          pasteObjectClipboard(
            getLayerPointFromClient(event.clientX, event.clientY)
          );
          return;
        }

        if (drawingMode) {
          if (!isDrawingPointer(event)) {
            if (event.target === event.currentTarget) {
              onSelectionChange([]);
            }
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
          className="absolute inset-0 h-full w-full"
          style={{
            width: pageWidth,
            height: drawingHeight,
            zIndex: 76,
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
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          style={{ zIndex: 76 }}
        >
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

      {pendingDrawings.map((object, index) => (
        <div
          key={object.id}
          className="pointer-events-none absolute"
          style={{
            left: object.x,
            top: object.y,
            width: object.width,
            height: object.height,
            zIndex: 60 + Math.min(index, 15),
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
        const canSelectObject = canSelectObjectInCurrentMode(
          object,
          selectionMode
        );
        const canObjectReceivePointer = canObjectReceivePointerInCurrentMode(
          object,
          selectionMode,
          drawingMode
        );
        const selected = selectedObjectIds.includes(object.id);
        const isRecognizedShape = isRecognizedDrawingShape(object);
        const showObjectControls =
          selected &&
          canShowSelectionControls &&
          !(hasDrawingOnlySelection && object.type === "drawing") &&
          !isRecognizedShape;
        const canFingerMoveSelectedDrawing =
          selectionMode && selected && object.type === "drawing";
        const canFingerUseRecognizedShape =
          isRecognizedShape && drawingMode && drawingTool !== "erase";

        if (object.type === "line") {
          const points = getLinePoints(object);
          const lineStrokeWidth = object.strokeWidth ?? 5;
          const showRecognizedLineControls =
            selected && isRecognizedShape && !selectionMode;
          const lineMidX = (points.startX + points.endX) / 2;
          const lineMidY = (points.startY + points.endY) / 2;

          return (
            <div
              key={object.id}
              className={`absolute inset-0 ${
                canFingerUseRecognizedShape ? "pointer-events-auto" : "pointer-events-none"
              }`}
              style={{
                zIndex: selected
                  ? 80
                  : canFingerUseRecognizedShape
                    ? 78
                    : canSelectObject
                      ? 40
                      : undefined,
              }}
            >
              <svg className="absolute inset-0 h-full w-full overflow-visible">
                {selected && !isRecognizedShape && (
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
                  className={
                    canObjectReceivePointer || canFingerUseRecognizedShape
                      ? "pointer-events-auto cursor-move"
                      : "pointer-events-none"
                  }
                  style={{
                    touchAction:
                      canObjectReceivePointer || canFingerUseRecognizedShape
                        ? "none"
                        : "auto",
                  }}
                  onPointerDown={(event) => {
                    if (
                      canFingerUseRecognizedShape &&
                      (event.pointerType === "mouse" ||
                        event.pointerType === "pen")
                    ) {
                      return;
                    }

                    if (
                      canFingerUseRecognizedShape &&
                      event.pointerType === "touch" &&
                      selected
                    ) {
                      setRecognizedShapeMenu(null);
                      startDrag(event, object);
                      return;
                    }

                    if (
                      canFingerUseRecognizedShape &&
                      event.pointerType === "touch"
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      onSelectionChange([object.id]);
                      setRecognizedShapeMenu("actions");
                      return;
                    }

                    if (!canObjectReceivePointer) return;
                    startDrag(event, object);
                  }}
                />
              </svg>

              {showObjectControls && hasSingleSelection && (
                <>
                  <div
                    className="absolute"
                    style={{ left: points.startX, top: points.startY }}
                  >
                    {!isRecognizedShape && renderActionToolbar()}
                  </div>
                  {!isRecognizedShape && (
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
                  )}

                  {openShapeMenuId === object.id && !isRecognizedShape && (
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
                      <label className={isDark ? "mt-2 block text-slate-100" : "mt-2 block text-gray-700"}>
                        Color
                        <input
                          type="color"
                          value={object.color ?? "#111827"}
                          className="mt-2 h-8 w-full rounded border"
                          onPointerDown={(event) => event.stopPropagation()}
                          onChange={(event) =>
                            updateObject(object.id, {
                              color: event.target.value,
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
              {showRecognizedLineControls && (
                <>
                  <button
                    type="button"
                    className={`pointer-events-auto absolute flex h-8 w-8 touch-none items-center justify-center rounded-full border-2 border-blue-600 text-sm shadow-sm ${
                      isDark
                        ? "bg-slate-900 text-slate-100"
                        : "bg-white text-gray-800"
                    }`}
                    title="Line options"
                    style={{
                      left: lineMidX + 12,
                      top: lineMidY - 40,
                      zIndex: 84,
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setRecognizedShapeMenu((current) =>
                        current === "actions" ? null : "actions"
                      );
                    }}
                  >
                    ⋯
                  </button>

                  {recognizedShapeMenu === "actions" && (
                    <div
                      className={selectionActionPanelClass}
                      style={{
                        left: lineMidX + 52,
                        top: lineMidY - 40,
                        zIndex: 85,
                      }}
                    >
                      {renderSelectionActionButton(
                        "Style",
                        "Style selected line",
                        () => setRecognizedShapeMenu("style")
                      )}
                      {renderSelectionActionButton(
                        "Duplicate",
                        "Duplicate selected line",
                        duplicateSelectedObjects
                      )}
                      {renderSelectionActionButton(
                        "Cut",
                        "Cut selected line",
                        cutSelectedObjects
                      )}
                      {renderSelectionActionButton(
                        "Copy",
                        "Copy selected line",
                        copySelectedObjects
                      )}
                      {renderSelectionActionButton(
                        "Delete",
                        "Delete selected line",
                        deleteSelectedObjects
                      )}
                    </div>
                  )}

                  {recognizedShapeMenu === "style" && (
                    <div
                      className={selectionActionPanelClass}
                      style={{
                        left: lineMidX + 52,
                        top: lineMidY - 40,
                        zIndex: 85,
                        width: 190,
                      }}
                    >
                      <button
                        type="button"
                        className={`${objectControlButtonClass} text-left`}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setRecognizedShapeMenu("actions");
                        }}
                      >
                        ← Options
                      </button>
                      <label
                        className={
                          isDark
                            ? "flex flex-col gap-1 px-2 py-1 text-slate-100"
                            : "flex flex-col gap-1 px-2 py-1 text-gray-700"
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        Thickness: {lineStrokeWidth}px
                        <input
                          type="range"
                          min="1"
                          max="36"
                          value={lineStrokeWidth}
                          className="w-full"
                          onChange={(event) =>
                            updateObject(object.id, {
                              strokeWidth: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label
                        className={
                          isDark
                            ? "flex items-center justify-between gap-2 px-2 py-1 text-slate-100"
                            : "flex items-center justify-between gap-2 px-2 py-1 text-gray-700"
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        Color
                        <input
                          type="color"
                          value={object.color ?? "#111827"}
                          className="h-8 w-10 rounded border"
                          onChange={(event) =>
                            updateObject(object.id, {
                              color: event.target.value,
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
                    style={{ left: points.startX, top: points.startY, touchAction: "none", zIndex: 84 }}
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
                    style={{ left: points.endX, top: points.endY, touchAction: "none", zIndex: 84 }}
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

        const shapeVertices = isVertexShape(object)
          ? getShapeVertices(object)
          : [];

        return (
          <div
            key={object.id}
            className={`${
              !canObjectReceivePointer &&
              !showObjectControls &&
              !canFingerMoveSelectedDrawing &&
              !canFingerUseRecognizedShape
                ? "pointer-events-none"
                : "pointer-events-auto"
            } absolute cursor-move ${
              selected &&
              !(hasDrawingOnlySelection && object.type === "drawing") &&
              !isRecognizedShape
                ? "ring-2 ring-blue-600 ring-offset-2 ring-offset-transparent"
                : ""
            }`}
            style={{
              left: object.x,
              top: object.y,
              width: object.width,
              height: object.height,
              zIndex: selected
                ? 80
                : canFingerUseRecognizedShape
                  ? 78
                  : canObjectReceivePointer
                    ? 40
                    : undefined,
              touchAction: object.type === "textbox" ? "auto" : "none",
              WebkitUserSelect: object.type === "textbox" ? undefined : "none",
              userSelect: object.type === "textbox" ? undefined : "none",
              transform: `rotate(${object.rotation ?? 0}deg) scale(${object.flipX ? -1 : 1}, ${
                object.flipY ? -1 : 1
              })`,
              transformOrigin: "center",
            }}
            onPointerDown={(event) => {
              if (
                canFingerUseRecognizedShape &&
                (event.pointerType === "mouse" || event.pointerType === "pen")
              ) {
                return;
              }

              if (
                !canObjectReceivePointer &&
                !(canFingerMoveSelectedDrawing && event.pointerType === "touch") &&
                !(
                  canFingerUseRecognizedShape &&
                  event.pointerType === "touch"
                )
              ) {
                return;
              }

              if (
                canFingerUseRecognizedShape &&
                event.pointerType === "touch" &&
                selected
              ) {
                setRecognizedShapeMenu(null);
                startDrag(event, object);
                return;
              }

              if (
                canFingerUseRecognizedShape &&
                event.pointerType === "touch"
              ) {
                event.preventDefault();
                event.stopPropagation();
                onSelectionChange([object.id]);
                setRecognizedShapeMenu("actions");
                return;
              }

              if (
                isRecognizedShape &&
                event.pointerType === "touch" &&
                !selectionMode
              ) {
                event.preventDefault();
                event.stopPropagation();
                onSelectionChange([object.id]);
                setRecognizedShapeMenu("actions");
                return;
              }

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
                {showObjectControls && hasSingleSelection && (
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
                  ref={(editor) => initializeTextBoxEditor(editor, object)}
                  contentEditable={!selectionMode}
                  suppressContentEditableWarning
                  tabIndex={selectionMode ? -1 : 0}
                  className="h-full w-full overflow-auto whitespace-pre-wrap border-none bg-transparent p-0 text-gray-950 outline-none empty:before:text-gray-400 empty:before:content-['Type_here...']"
                  style={{
                    color: object.color ?? (isDark ? "#f8fafc" : "#111827"),
                    fontSize: `${object.fontSize ?? 16}px`,
                    fontFamily: object.fontFamily ?? "Arial",
                    lineHeight: "normal",
                    WebkitUserSelect: selectionMode ? "none" : undefined,
                    userSelect: selectionMode ? "none" : undefined,
                    WebkitTouchCallout: selectionMode ? "none" : undefined,
                  }}
                  onPointerDown={(event) => {
                    if (selectionMode) {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                    event.stopPropagation();
                    onSelectionChange([object.id]);
                  }}
                  onFocus={(event) => {
                    if (selectionMode) event.currentTarget.blur();
                  }}
                  onMouseUp={(event) => {
                    if (!selectionMode) saveTextSelection(event.currentTarget);
                  }}
                  onKeyUp={(event) => {
                    if (!selectionMode) saveTextSelection(event.currentTarget);
                  }}
                  onBeforeInput={(event) => {
                    if (selectionMode) event.preventDefault();
                  }}
                  onInput={(event) => {
                    if (selectionMode) {
                      event.preventDefault();
                      event.currentTarget.innerHTML =
                        event.currentTarget.dataset.lastObjectHtml ?? "";
                      return;
                    }

                    event.currentTarget.dataset.lastObjectHtml =
                      event.currentTarget.innerHTML;
                    updateTextBoxContent(object.id, event.currentTarget);
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    if (selectionMode) return;

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
              <div className="relative h-full w-full overflow-hidden">
                <StoredImage
                  src={object.src}
                  alt="Uploaded image"
                  className="absolute object-fill"
                  style={getCroppedImageStyle(object)}
                />
              </div>
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
                  strokeWidth={object.strokeWidth ?? 2}
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
                  strokeWidth={object.strokeWidth ?? 2}
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
                  strokeWidth={object.strokeWidth ?? 2}
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

            {showObjectControls &&
              hasSingleSelection &&
              isVertexShape(object) &&
              !isRecognizedShape && (
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
                        ? "pointer-events-auto absolute -top-16 left-12 z-50 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-100 shadow-lg"
                        : "pointer-events-auto absolute -top-16 left-12 z-50 flex items-center gap-2 rounded-lg border bg-white p-2 text-xs shadow-lg"
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

            {showObjectControls && hasSingleSelection && isVertexShape(object) && shapeEditMode === "points" &&
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

            {showObjectControls && hasSingleSelection && (
              <>
                {!isRecognizedShape && renderActionToolbar()}

                <div
                  className={`absolute -right-5 -top-5 flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded-full border-2 border-blue-600 text-sm leading-none shadow-sm ${
                    isDark
                      ? "bg-slate-900 text-slate-100"
                      : "bg-white text-gray-800"
                  }`}
                  title="Rotate"
                  onPointerDown={(event) => startRotate(event, object)}
                >
                  ↻
                </div>

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
                {object.type === "image" && cropImageId === object.id && (
                  <>
                    <div
                      className={`absolute left-0 top-0 h-full w-3 -translate-x-1/2 touch-none cursor-ew-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900" : "bg-white"}`}
                      title="Crop left"
                      onPointerDown={(event) =>
                        startImageCrop(event, object, "left")
                      }
                    />
                    <div
                      className={`absolute right-0 top-0 h-full w-3 translate-x-1/2 touch-none cursor-ew-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900" : "bg-white"}`}
                      title="Crop right"
                      onPointerDown={(event) =>
                        startImageCrop(event, object, "right")
                      }
                    />
                    <div
                      className={`absolute left-0 top-0 h-3 w-full -translate-y-1/2 touch-none cursor-ns-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900" : "bg-white"}`}
                      title="Crop top"
                      onPointerDown={(event) =>
                        startImageCrop(event, object, "top")
                      }
                    />
                    <div
                      className={`absolute bottom-0 left-0 h-3 w-full translate-y-1/2 touch-none cursor-ns-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900" : "bg-white"}`}
                      title="Crop bottom"
                      onPointerDown={(event) =>
                        startImageCrop(event, object, "bottom")
                      }
                    />
                  </>
                )}
                {isVertexShape(object) && shapeEditMode === "resize" && (
                  <>
                    <div
                      className={`absolute -right-2 top-1/2 h-7 w-3 -translate-y-1/2 touch-none cursor-ew-resize rounded-full ${objectHandleClass}`}
                      title="Resize shape width"
                      onPointerDown={(event) =>
                        startResize(event, object, "horizontal")
                      }
                    />
                    <div
                      className={`absolute -bottom-2 left-1/2 h-3 w-7 -translate-x-1/2 touch-none cursor-ns-resize rounded-full ${objectHandleClass}`}
                      title="Resize shape height"
                      onPointerDown={(event) =>
                        startResize(event, object, "vertical")
                      }
                    />
                    <div
                      className={`absolute -right-2 -bottom-2 h-4 w-4 touch-none cursor-nwse-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
                      title="Resize shape proportionally"
                      onPointerDown={(event) =>
                        startResize(event, object, "proportional")
                      }
                    />
                  </>
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

      {selectedRecognizedShapeBounds && selectedRecognizedShape && !selectionMode && (
        <>
          <div
            className="pointer-events-none absolute border-2 border-blue-600"
            style={{
              left: selectedRecognizedShapeBounds.left,
              top: selectedRecognizedShapeBounds.top,
              width: selectedRecognizedShapeBounds.width,
              height: selectedRecognizedShapeBounds.height,
              zIndex: 79,
            }}
          />
          <div
            className={`pointer-events-auto absolute flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded-full border-2 border-blue-600 text-sm leading-none shadow-sm ${
              isDark
                ? "bg-slate-900 text-slate-100"
                : "bg-white text-gray-800"
            }`}
            title="Rotate formed shape"
            style={{
              left:
                selectedRecognizedShapeBounds.left +
                selectedRecognizedShapeBounds.width -
                10,
              top: selectedRecognizedShapeBounds.top - 18,
              zIndex: 84,
            }}
            onPointerDown={(event) => startRotate(event, selectedRecognizedShape)}
          >
            ↻
          </div>
          <div
            className={`pointer-events-auto absolute flex h-6 w-6 touch-none cursor-nwse-resize items-center justify-center rounded-full border-2 border-blue-600 text-xs shadow-sm ${
              isDark
                ? "bg-slate-900 text-slate-100"
                : "bg-white text-gray-800"
            }`}
            title="Resize formed shape"
            style={{
              left:
                selectedRecognizedShapeBounds.left +
                selectedRecognizedShapeBounds.width -
                10,
              top:
                selectedRecognizedShapeBounds.top +
                selectedRecognizedShapeBounds.height -
                10,
              zIndex: 84,
            }}
            onPointerDown={(event) =>
              startRecognizedShapeResize(event, selectedRecognizedShape)
            }
          >
            ↘
          </div>
          <button
            type="button"
            className={`pointer-events-auto absolute flex h-8 w-8 touch-none items-center justify-center rounded-full border-2 border-blue-600 text-sm shadow-sm ${
              isDark
                ? "bg-slate-900 text-slate-100"
                : "bg-white text-gray-800"
            }`}
            title="Shape options"
            style={{
              left:
                selectedRecognizedShapeBounds.left +
                selectedRecognizedShapeBounds.width +
                8,
              top:
                selectedRecognizedShapeBounds.top +
                selectedRecognizedShapeBounds.height -
                16,
              zIndex: 84,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setRecognizedShapeMenu((current) =>
                current === "actions" ? null : "actions"
              );
            }}
          >
            ⋯
          </button>

          {recognizedShapeMenu === "actions" && (
            <div
              className={selectionActionPanelClass}
              style={{
                left:
                  selectedRecognizedShapeBounds.left +
                  selectedRecognizedShapeBounds.width +
                  44,
                top:
                  selectedRecognizedShapeBounds.top +
                  selectedRecognizedShapeBounds.height -
                  16,
                zIndex: 85,
              }}
            >
              {renderSelectionActionButton("Style", "Style selected shape", () =>
                setRecognizedShapeMenu("style")
              )}
              {renderSelectionActionButton(
                "Duplicate",
                "Duplicate selected shape",
                duplicateSelectedObjects
              )}
              {renderSelectionActionButton("Cut", "Cut selected shape", cutSelectedObjects)}
              {renderSelectionActionButton("Copy", "Copy selected shape", copySelectedObjects)}
              {renderSelectionActionButton(
                "Delete",
                "Delete selected shape",
                deleteSelectedObjects
              )}
            </div>
          )}

          {recognizedShapeMenu === "style" && (
            <div
              className={selectionActionPanelClass}
              style={{
                left:
                  selectedRecognizedShapeBounds.left +
                  selectedRecognizedShapeBounds.width +
                  44,
                top:
                  selectedRecognizedShapeBounds.top +
                  selectedRecognizedShapeBounds.height -
                  16,
                zIndex: 85,
                width: 190,
              }}
            >
              <button
                type="button"
                className={`${objectControlButtonClass} text-left`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setRecognizedShapeMenu("actions");
                }}
              >
                ← Options
              </button>
              <label
                className={
                  isDark
                    ? "flex flex-col gap-1 px-2 py-1 text-slate-100"
                    : "flex flex-col gap-1 px-2 py-1 text-gray-700"
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                Thickness: {selectedRecognizedShape.strokeWidth ?? 2}px
                <input
                  type="range"
                  min="1"
                  max="36"
                  value={selectedRecognizedShape.strokeWidth ?? 2}
                  className="w-full"
                  onChange={(event) =>
                    updateObject(selectedRecognizedShape.id, {
                      strokeWidth: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label
                className={
                  isDark
                    ? "flex items-center justify-between gap-2 px-2 py-1 text-slate-100"
                    : "flex items-center justify-between gap-2 px-2 py-1 text-gray-700"
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                Color
                <input
                  type="color"
                  value={selectedRecognizedShape.color ?? "#111827"}
                  className="h-8 w-10 rounded border"
                  onChange={(event) =>
                    updateObject(selectedRecognizedShape.id, {
                      color: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          )}
        </>
      )}

      {drawingSelectionBounds && canShowSelectionControls && (
        <>
          <div
            className="pointer-events-none absolute border-2 border-blue-600"
            style={{
              left: drawingSelectionBounds.left,
              top: drawingSelectionBounds.top,
              width: drawingSelectionBounds.width,
              height: drawingSelectionBounds.height,
              zIndex: 79,
            }}
          />
          <button
            type="button"
            className={`pointer-events-auto absolute flex h-8 w-8 touch-none items-center justify-center rounded-full border-2 border-blue-600 text-sm shadow-sm ${
              isDark
                ? "bg-slate-900 text-slate-100"
                : "bg-white text-gray-800"
            }`}
            title="Drawing options"
            style={{
              left: drawingSelectionBounds.left + drawingSelectionBounds.width + 8,
              top: drawingSelectionBounds.top + drawingSelectionBounds.height - 16,
              zIndex: 82,
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDrawingSelectionMenu((current) =>
                current === "actions" ? null : "actions"
              );
            }}
          >
            ⋯
          </button>

          {drawingSelectionMenu === "actions" && (
            <div
              className={selectionActionPanelClass}
              style={{
                left: drawingSelectionBounds.left + drawingSelectionBounds.width + 44,
                top: drawingSelectionBounds.top + drawingSelectionBounds.height - 16,
                zIndex: 83,
              }}
            >
              {renderSelectionActionButton("Style", "Style selected strokes", () =>
                setDrawingSelectionMenu("style")
              )}
              {renderSelectionActionButton(
                "Duplicate",
                "Duplicate selected strokes",
                duplicateSelectedObjects
              )}
              {renderSelectionActionButton("Cut", "Cut selected strokes", cutSelectedObjects)}
              {renderSelectionActionButton("Copy", "Copy selected strokes", copySelectedObjects)}
              {renderSelectionActionButton(
                "Delete",
                "Delete selected strokes",
                deleteSelectedObjects
              )}
            </div>
          )}

          {drawingSelectionMenu === "style" && (
            <div
              className={selectionActionPanelClass}
              style={{
                left: drawingSelectionBounds.left + drawingSelectionBounds.width + 44,
                top: drawingSelectionBounds.top + drawingSelectionBounds.height - 16,
                zIndex: 83,
                width: 190,
              }}
            >
              <button
                type="button"
                className={`${objectControlButtonClass} text-left`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDrawingSelectionMenu("actions");
                }}
              >
                ← Options
              </button>
              <label
                className={
                  isDark
                    ? "flex flex-col gap-1 px-2 py-1 text-slate-100"
                    : "flex flex-col gap-1 px-2 py-1 text-gray-700"
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                Thickness: {drawingSelectionThicknessLabel}
                <input
                  type="range"
                  min="1"
                  max="36"
                  value={drawingSelectionThickness}
                  className="w-full"
                  onChange={(event) =>
                    updateSelectedDrawingObjects({
                      strokeWidth: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label
                className={
                  isDark
                    ? "flex items-center justify-between gap-2 px-2 py-1 text-slate-100"
                    : "flex items-center justify-between gap-2 px-2 py-1 text-gray-700"
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                Color
                <input
                  type="color"
                  value={drawingSelectionColor}
                  className="h-8 w-10 rounded border"
                  onChange={(event) =>
                    updateSelectedDrawingObjects({
                      color: event.target.value,
                    })
                  }
                />
              </label>
            </div>
          )}
        </>
      )}

      {selectedGroupBounds && canShowSelectionControls && !hasDrawingOnlySelection && (
        <>
          <div
            className="pointer-events-none absolute border-2 border-blue-600"
            style={{
              left: selectedGroupBounds.left,
              top: selectedGroupBounds.top,
              width: selectedGroupBounds.width,
              height: selectedGroupBounds.height,
              zIndex: 79,
            }}
          />
          <div
            className={`pointer-events-auto absolute h-5 w-5 touch-none cursor-nwse-resize rounded-full border-2 border-blue-600 ${isDark ? "bg-slate-900 shadow-sm" : "bg-white shadow-sm"}`}
            title="Scale selected objects"
            style={{
              left: selectedGroupBounds.left + selectedGroupBounds.width - 8,
              top: selectedGroupBounds.top + selectedGroupBounds.height - 8,
              zIndex: 81,
            }}
            onPointerDown={startGroupResize}
          />
          <div
            className={selectionActionPanelClass}
            style={{
              left: selectedGroupBounds.left,
              top: selectedGroupBounds.top + selectedGroupBounds.height + 8,
              zIndex: 80,
            }}
          >
            {renderMoveActionButton()}
            {selectedDrawingObjects.length > 0 && (
              <>
                <label
                  className={
                    isDark
                      ? "flex flex-col gap-1 px-2 py-1 text-slate-100"
                      : "flex flex-col gap-1 px-2 py-1 text-gray-700"
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Thickness
                  <input
                    type="range"
                    min="1"
                    max="36"
                    value={selectedDrawingObjects[0].strokeWidth ?? 4}
                    className="w-full"
                    onChange={(event) =>
                      updateSelectedDrawingObjects({
                        strokeWidth: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label
                  className={
                    isDark
                      ? "flex items-center justify-center gap-2 px-2 py-1 text-slate-100"
                      : "flex items-center justify-center gap-2 px-2 py-1 text-gray-700"
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  Color
                  <input
                    type="color"
                    value={selectedDrawingObjects[0].color ?? "#111827"}
                    className="h-8 w-10 rounded border"
                    onChange={(event) =>
                      updateSelectedDrawingObjects({
                        color: event.target.value,
                      })
                    }
                  />
                </label>
              </>
            )}
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
                (event) =>
                  pasteObjectClipboard(
                    getLayerPointFromClient(event.clientX, event.clientY)
                  )
              )}
            {renderSelectionActionButton(
              "Delete",
              "Delete selected objects",
              deleteSelectedObjects
            )}
          </div>
        </>
      )}

      {!selectedGroupBounds && objectClipboard.length > 0 && objectClipboardAnchor && (
        <div
          className={
            isDark
              ? "pointer-events-none absolute z-50 rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-sm"
              : "pointer-events-none absolute z-50 rounded-full border bg-white px-2 py-1 text-xs text-gray-700 shadow-sm"
          }
          style={{
            left: objectClipboardAnchor.x + 8,
            top: objectClipboardAnchor.y + 8,
            zIndex: 80,
          }}
        >
          Click to paste
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
