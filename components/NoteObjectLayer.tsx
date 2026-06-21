"use client";

import { useRef, useState } from "react";
import type { NoteObject, ShapeVertex } from "@/lib/types";
import { StoredImage } from "@/components/StoredImage";
import { deleteStoredImage } from "@/lib/image-storage";

type NoteObjectLayerProps = {
  objects: NoteObject[];
  selectedObjectIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onChangeObjects: (objects: NoteObject[]) => void;
  selectionMode: boolean;
};

type SelectionBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

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
}: NoteObjectLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  function updateObject(id: string, updates: Partial<NoteObject>) {
    onChangeObjects(
      objects.map((object) =>
        object.id === id ? { ...object, ...updates } : object
      )
    );
  }

  function deleteObject(id: string) {
    const deletedObject = objects.find((object) => object.id === id);
    if (deletedObject?.type === "image" && deletedObject.src) {
      void deleteStoredImage(deletedObject.src);
    }

    onChangeObjects(objects.filter((object) => object.id !== id));
    onSelectionChange(selectedObjectIds.filter((selectedId) => selectedId !== id));
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
                ? Math.round(nextY / 32) * 32
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
    if (!selectionMode || event.target !== event.currentTarget) return;

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
          .filter(
            (object) =>
              object.type !== "textbox" &&
              boxesIntersect(box, getObjectBounds(object))
          )
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
        selectionMode
          ? "pointer-events-auto absolute inset-0 z-20 cursor-crosshair"
          : "pointer-events-none absolute inset-0 z-20"
      }
      onPointerDown={startSelectionBox}
    >
      {objects.map((object) => {
        const selected = selectedObjectIds.includes(object.id);

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
                    className="pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-600 bg-white shadow-sm"
                    style={{ left: points.startX, top: points.startY }}
                    onPointerDown={(event) =>
                      startLineEndpointDrag(event, object, "start")
                    }
                  />
                  <div
                    className="pointer-events-auto absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-600 bg-white shadow-sm"
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

        const ignoreDuringBoxSelection =
          selectionMode && object.type === "textbox";
        const shapeVertices = isVertexShape(object)
          ? getShapeVertices(object)
          : [];

        return (
          <div
            key={object.id}
            className={`${
              ignoreDuringBoxSelection ? "pointer-events-none" : "pointer-events-auto"
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
                  <div
                    className="absolute -top-7 left-0 rounded-md bg-black px-2 py-1 text-xs text-white"
                    onPointerDown={(event) => startDrag(event, object)}
                  >
                    Move
                  </div>
                )}
                <textarea
                  value={object.text ?? ""}
                  placeholder="Type here..."
                  className="h-full w-full resize-none border-none bg-transparent p-0 text-gray-950 outline-none"
                  style={{
                    color: object.color ?? "#111827",
                    fontSize: `${object.fontSize ?? 16}px`,
                    fontFamily: object.fontFamily ?? "Arial",
                    lineHeight: "32px",
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectionChange([object.id]);
                  }}
                  onChange={(event) =>
                    updateObject(object.id, { text: event.target.value })
                  }
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

            {selected && hasSingleSelection && isVertexShape(object) &&
              shapeVertices.map((vertex, index) => (
                <div
                  key={`${object.id}-vertex-${index}`}
                  className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-blue-600 bg-white shadow-sm"
                  style={{ left: vertex.x, top: vertex.y }}
                  onPointerDown={(event) =>
                    startVertexDrag(event, object, index)
                  }
                />
              ))}

            {selected && hasSingleSelection && (
              <>
                {(object.type === "image" || object.type === "sticker") && (
                  <>
                    <div
                      className="absolute -right-2 top-1/2 h-7 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border bg-white shadow-sm"
                      title="Resize width"
                      onPointerDown={(event) =>
                        startResize(event, object, "horizontal")
                      }
                    />
                    <div
                      className="absolute -bottom-2 left-1/2 h-3 w-7 -translate-x-1/2 cursor-ns-resize rounded-full border bg-white shadow-sm"
                      title="Resize height"
                      onPointerDown={(event) =>
                        startResize(event, object, "vertical")
                      }
                    />
                    <div
                      className="absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-blue-600 bg-white shadow-sm"
                      title="Scale proportionally"
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
                    className="absolute -right-2 -bottom-2 h-4 w-4 cursor-se-resize rounded-full border bg-white"
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
