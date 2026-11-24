"use client";
import { PropertyImage } from "./property-image";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { trapDialogFocus } from "./website-dialog-focus";
import "@/styles/property-photo-dialog.css";

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
  const [aspectRatio, setAspectRatio] = useState(1.5);
  const [previousPhoto, setPreviousPhoto] = useState<{
    index: number;
    offset: number;
    direction: number;
  } | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const selectPhoto = (next: number, direction: number) => {
    if (next === index) return;
    // Retain the last visible photograph while the next one loads.
    setPreviousPhoto(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? null
        : {
            index: photoReady ? index : (previousPhoto?.index ?? index),
            offset: dragX,
            direction,
          },
    );
    setPhotoReady(false);
    setIndex(next);
    setDragX(0);
  };
  const navigate = (direction: number) => {
    if (images.length < 2) return;
    selectPhoto((index + direction + images.length) % images.length, direction);
  };
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
  const thumbnails = useRef<HTMLDivElement>(null);
  const selectedThumbnail = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stopAnimation = () => {
      if (motion.matches) setPreviousPhoto(null);
    };
    motion.addEventListener("change", stopAnimation);
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      motion.removeEventListener("change", stopAnimation);
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const rail = thumbnails.current;
    const selected = selectedThumbnail.current;
    if (!rail || !selected) return;

    const centerThumbnail = (behavior: ScrollBehavior) => {
      rail.scrollTo({
        left:
          selected.offsetLeft - (rail.clientWidth - selected.offsetWidth) / 2,
        behavior,
      });
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    centerThumbnail(
      index === initial || reducedMotion.matches ? "instant" : "smooth",
    );
    const onResize = () => centerThumbnail("instant");
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [index, initial]);
  return (
    <dialog
      ref={ref}
      className="property-photo-dialog"
      aria-label="Galeria foto a proprietății"
      onPointerDownCapture={(e) => {
        if (e.isPrimary) suppressClick.current = false;
      }}
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
          navigate(1);
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          navigate(-1);
        }
      }}
    >
      <header className="property-photo-header">
        <div className="property-photo-heading">
          <span className="property-photo-title">{title}</span>
          <span className="property-photo-count" aria-live="polite">
            {index + 1} / {images.length}
          </span>
        </div>
        <button
          type="button"
          className="property-photo-control"
          aria-label="Închide galeria"
          onClick={onClose}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      <div
        className="property-photo-body"
        style={{ "--photo-aspect-ratio": aspectRatio } as CSSProperties}
      >
        <div className="property-photo-stage">
          <div
            className="property-photo-frame"
            onPointerDown={(e) => {
              if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
              if (!e.isPrimary) {
                resetGesture();
                return;
              }
              if (images.length < 2) return;
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
                navigate(dx < 0 ? 1 : -1);
              }
              resetGesture();
            }}
            onPointerCancel={resetGesture}
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            {previousPhoto && (
              <PropertyImage
                key={`previous-${previousPhoto.index}`}
                className={`photo-outgoing${photoReady ? " photo-transitioning" : ""}`}
                style={
                  {
                    "--photo-offset": `${previousPhoto.offset}px`,
                    "--photo-exit": `${previousPhoto.offset - previousPhoto.direction * 90}px`,
                  } as CSSProperties
                }
                sizes="(max-width: 640px) 100vw, (max-width: 1600px) 88vw, 1480px"
                loading="eager"
                src={images[previousPhoto.index]}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            )}
            <PropertyImage
              key={index}
              data-current-photo="true"
              data-dragging={dragX !== 0}
              className={
                previousPhoto
                  ? photoReady
                    ? "photo-incoming"
                    : "photo-waiting"
                  : undefined
              }
              draggable={false}
              style={
                {
                  transform: `translateX(${dragX}px)`,
                  "--photo-enter": `${(previousPhoto?.direction ?? 1) * 90}px`,
                } as CSSProperties
              }
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth && naturalHeight)
                  setAspectRatio(naturalWidth / naturalHeight);
                setPhotoReady(true);
              }}
              onError={() => setPhotoReady(true)}
              onAnimationEnd={() => setPreviousPhoto(null)}
              sizes="(max-width: 640px) 100vw, (max-width: 1600px) 88vw, 1480px"
              loading="eager"
              src={images[index]}
              alt={`${title} — fotografia ${index + 1}`}
            />
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="property-photo-control property-photo-prev"
                aria-label="Fotografia anterioară"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="property-photo-control property-photo-next"
                aria-label="Fotografia următoare"
                onClick={() => navigate(1)}
              >
                <ChevronRight size={24} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div
            className="property-photo-thumbnails"
            ref={thumbnails}
            role="group"
            aria-label="Miniaturi fotografii"
          >
            {images.map((image, photoIndex) => (
              <button
                key={photoIndex}
                ref={photoIndex === index ? selectedThumbnail : undefined}
                type="button"
                aria-label={`Fotografia ${photoIndex + 1}`}
                aria-current={photoIndex === index ? "true" : undefined}
                onClick={() =>
                  selectPhoto(photoIndex, Math.sign(photoIndex - index))
                }
              >
                <PropertyImage
                  src={image}
                  alt=""
                  sizes="84px"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
