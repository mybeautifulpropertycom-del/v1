"use client";

import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { useRef, useState } from "react";
import { PropertyImage } from "./property-image";

export function AtelierMobileGallery({
  images,
  captions,
  title,
  initial = 0,
  onOpen,
}: {
  images: string[];
  captions: string[];
  title: string;
  initial?: number;
  onOpen: (index: number) => void;
}) {
  const [selected, setSelected] = useState(initial);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const count = images.length;
  const index = Math.min(selected, count - 1);
  const navigate = (direction: number) => {
    setSelected(
      (current) => (Math.min(current, count - 1) + direction + count) % count,
    );
  };

  return (
    <div
      className="atelier-mobile-gallery"
      role="group"
      aria-label="Fotografiile proprietății"
    >
      <div
        className="atelier-mobile-gallery-stage"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current =
            event.touches.length === 1
              ? { x: touch.clientX, y: touch.clientY }
              : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start || event.touches.length || count < 2) return;
          const touch = event.changedTouches[0];
          const x = touch.clientX - start.x;
          const y = touch.clientY - start.y;
          if (Math.abs(x) >= 40 && Math.abs(x) > Math.abs(y) * 1.2) {
            navigate(x < 0 ? 1 : -1);
          }
        }}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        <PropertyImage
          src={images[index]}
          alt={captions[index] || `${title} — fotografia ${index + 1}`}
          sizes="100vw"
        />
      </div>
      <button
        type="button"
        className="atelier-mobile-gallery-control atelier-mobile-gallery-expand"
        aria-label={`Mărește fotografia proprietății ${index + 1}`}
        onClick={() => onOpen(index)}
      >
        <Expand size={19} aria-hidden="true" />
      </button>
      {count > 1 && (
        <div className="atelier-mobile-gallery-arrows">
          <button
            type="button"
            className="atelier-mobile-gallery-control"
            aria-label="Fotografia anterioară"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="atelier-mobile-gallery-control"
            aria-label="Fotografia următoare"
            onClick={() => navigate(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      <span className="atelier-mobile-gallery-count" aria-live="polite">
        {index + 1} / {count}
      </span>
    </div>
  );
}
