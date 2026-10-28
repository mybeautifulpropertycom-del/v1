"use client";
import { PropertyImage } from "./property-image";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { trapDialogFocus } from "./website-dialog-focus";

export function PropertyPhotoDialog({
  images,
  title,
  initial,
  onClose,
}: {
  images: string[];
  title: string;
  initial: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initial);
  const [dragX, setDragX] = useState(0);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const resetGesture = () => {
    gesture.current = null;
    setDragX(0);
  };
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="property-photo-dialog lightbox"
      aria-label="Property photo gallery"
      onPointerDown={(e) => {
        if (e.isPrimary) suppressClick.current = false;
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        if (!e.isPrimary) {
          resetGesture();
          return;
        }
        if ((e.target as Element).closest("button") || images.length < 2)
          return;
        gesture.current = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          horizontal: false,
        };
      }}
      onPointerMove={(e) => {
        const start = gesture.current;
        if (!start || start.id !== e.pointerId) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!start.horizontal) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
          // Let vertical scrolling and pinch zoom remain browser gestures.
          if (Math.abs(dx) <= Math.abs(dy) * 1.2) {
            resetGesture();
            return;
          }
          start.horizontal = true;
        }
        suppressClick.current = true;
        setDragX(Math.max(-120, Math.min(120, dx)));
      }}
      onPointerUp={(e) => {
        const start = gesture.current;
        if (!start || start.id !== e.pointerId) return;
        const dx = e.clientX - start.x;
        const threshold = Math.min(
          80,
          Math.max(40, e.currentTarget.clientWidth * 0.12),
        );
        if (start.horizontal && Math.abs(dx) >= threshold) {
          setIndex(
            (current) =>
              (current + (dx < 0 ? 1 : -1) + images.length) % images.length,
          );
        }
        resetGesture();
      }}
      onPointerCancel={resetGesture}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        trapDialogFocus(e);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          setIndex((index + 1) % images.length);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setIndex((index - 1 + images.length) % images.length);
        }
      }}
    >
      <button
        type="button"
        className="lightbox-close"
        aria-label="Close gallery"
        onClick={onClose}
      >
        <X size={26} />
      </button>
      <button
        type="button"
        className="lightbox-prev"
        aria-label="Previous photo"
        onClick={() => setIndex((index - 1 + images.length) % images.length)}
      >
        <ChevronLeft size={30} />
      </button>
      <PropertyImage
        draggable={false}
        style={{ transform: `translateX(${dragX}px)` }}
        sizes="100vw"
        loading="eager"
        src={images[index]}
        alt={`${title} — view ${index + 1}`}
      />
      <button
        type="button"
        className="lightbox-next"
        aria-label="Next photo"
        onClick={() => setIndex((index + 1) % images.length)}
      >
        <ChevronRight size={30} />
      </button>
      <span aria-live="polite">
        {index + 1} / {images.length}
      </span>
    </dialog>
  );
}
