import { useState, useRef, useCallback } from "react";

export function useResizable(
  initialSize: number,
  direction: "horizontal" | "vertical" = "horizontal",
  min = 140,
  max = 700,
) {
  const [size, setSize] = useState(initialSize);
  const sizeRef = useRef(initialSize);
  sizeRef.current = size;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const startPos = direction === "horizontal" ? e.clientX : e.clientY;
      const startSize = sizeRef.current;

      const onMove = (ev: MouseEvent) => {
        const delta = (direction === "horizontal" ? ev.clientX : ev.clientY) - startPos;
        setSize(Math.max(min, Math.min(max, startSize + delta)));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
      e.preventDefault();
    },
    [direction, min, max],
  );

  return { size, onMouseDown };
}
