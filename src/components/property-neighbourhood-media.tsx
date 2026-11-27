"use client";

import {
  ArrowLeft,
  ArrowRight,
  BusFront,
  GraduationCap,
  Landmark,
  School,
  ShoppingBag,
  Trees,
  Utensils,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  nearbyCategories,
  safeExternalUrl,
  type NearbyCategory,
} from "@/lib/property-location";

const categoryIcons = {
  schools: GraduationCap,
  childcare: School,
  restaurants: Utensils,
  parks: Trees,
  shopping: ShoppingBag,
  culture: Landmark,
  transport: BusFront,
};

export function NearbyPlaceMedia({
  category,
  photo,
}: {
  category: NearbyCategory["id"];
  photo?: google.maps.places.Photo;
}) {
  const Icon = categoryIcons[category];
  const [src, setSrc] = useState(() => {
    try {
      return safeExternalUrl(photo?.getURI({ maxWidth: 360, maxHeight: 240 }));
    } catch {
      return undefined;
    }
  });

  return (
    <figure className="neighbourhood-place-media">
      <div className="neighbourhood-thumbnail">
        <Icon size={28} strokeWidth={1.6} aria-hidden="true" />
        {src && (
          // Display Google's photo directly, with its attribution and without an image proxy.
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setSrc(undefined)}
          />
        )}
      </div>
      {src && Boolean(photo?.authorAttributions?.length) && (
        <figcaption>
          {photo?.authorAttributions.map((author, index) => {
            const url = safeExternalUrl(author.uri);
            return url ? (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {author.displayName}
              </a>
            ) : (
              <span key={index}>{author.displayName}</span>
            );
          })}
        </figcaption>
      )}
    </figure>
  );
}

export function NearbyCategoryCarousel({
  category,
  disabled,
  onSelect,
}: {
  category: NearbyCategory;
  disabled: boolean;
  onSelect: (item: NearbyCategory) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({ back: false, forward: false });

  useEffect(() => {
    const track = rail.current;
    if (!track) return;
    const update = () =>
      setCanScroll({
        back: track.scrollLeft > 1,
        forward: track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
      });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    track.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      track.removeEventListener("scroll", update);
    };
  }, []);

  function scrollRail(direction: number) {
    const track = rail.current;
    if (!track) return;
    track.scrollBy({
      left: direction * track.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <div className="neighbourhood-explore">
      <h3>Explorează împrejurimile</h3>
      <div className="neighbourhood-carousel">
        <button
          type="button"
          className="neighbourhood-rail-arrow"
          aria-label="Categorii anterioare"
          disabled={!canScroll.back}
          onClick={() => scrollRail(-1)}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div
          ref={rail}
          className="neighbourhood-categories"
          role="group"
          aria-label="Descoperă locurile din apropiere"
        >
          {nearbyCategories.map((item) => {
            const Icon = categoryIcons[item.id];
            return (
              <button
                type="button"
                key={item.id}
                aria-pressed={category.id === item.id}
                disabled={disabled}
                onClick={() => onSelect(item)}
              >
                <Icon size={23} strokeWidth={1.6} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="neighbourhood-rail-arrow"
          aria-label="Categorii următoare"
          disabled={!canScroll.forward}
          onClick={() => scrollRail(1)}
        >
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
