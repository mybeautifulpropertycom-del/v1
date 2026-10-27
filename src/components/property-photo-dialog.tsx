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
