import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type FloatingPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPosition(position: FloatingPosition, size: number, margin: number): FloatingPosition {
  const maxX = Math.max(margin, window.innerWidth - size - margin);
  const maxY = Math.max(margin, window.innerHeight - size - margin);

  return {
    x: clamp(position.x, margin, maxX),
    y: clamp(position.y, margin, maxY),
  };
}

export function useFloatingPosition(
  storageKey: string,
  defaultPosition: () => FloatingPosition,
  options?: { size?: number; margin?: number },
) {
  const size = options?.size ?? 56;
  const margin = options?.margin ?? 16;
  const defaultPositionRef = useRef(defaultPosition);
  defaultPositionRef.current = defaultPosition;
  const [position, setPosition] = useState<FloatingPosition | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FloatingPosition;
        return clampPosition(parsed, size, margin);
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    return clampPosition(defaultPosition(), size, margin);
  });
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as FloatingPosition;
        setPosition(clampPosition(parsed, size, margin));
        return;
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }

    setPosition(clampPosition(defaultPositionRef.current(), size, margin));
  }, [margin, size, storageKey]);

  useEffect(() => {
    if (!position || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(position));
  }, [position, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      setPosition((current) => (current ? clampPosition(current, size, margin) : current));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [margin, size]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!position) {
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }, [position]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const nextPosition = clampPosition(
      {
        x: dragState.originX + (event.clientX - dragState.startX),
        y: dragState.originY + (event.clientY - dragState.startY),
      },
      size,
      margin,
    );

    if (Math.abs(event.clientX - dragState.startX) > 4 || Math.abs(event.clientY - dragState.startY) > 4) {
      dragState.moved = true;
    }

    setPosition(nextPosition);
  }, [margin, size]);

  const finishDrag = useCallback((pointerId: number) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== pointerId) {
      return;
    }

    if (dragState.moved) {
      suppressClickRef.current = true;
    }

    dragStateRef.current = null;
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    finishDrag(event.pointerId);
  }, [finishDrag]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    finishDrag(event.pointerId);
  }, [finishDrag]);

  const shouldSuppressClick = useCallback(() => {
    if (!suppressClickRef.current) {
      return false;
    }

    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    position,
    floatingStyle: position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined,
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
    shouldSuppressClick,
  };
}
