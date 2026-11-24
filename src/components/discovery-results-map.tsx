"use client";

import Link from "next/link";
import { ArrowUpRight, House, List, MapPin, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, withMapsTimeout } from "@/lib/google-maps";
import { mapsEnabled } from "@/lib/property-location";

type MapListing = {
  placeId: string;
  href: string;
  title: string;
  price: string;
};

type MapPoint = {
  position: google.maps.LatLngLiteral;
  listings: MapListing[];
};

const resultMapStyle: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#efe7d9" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4e5c55" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f8f2e8" }] },
  { featureType: "landscape.natural", stylers: [{ color: "#eee5d7" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#dbe8c0" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#fffdf7" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#ead9b7" }],
  },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#bbdce5" }],
  },
];

async function locateListings(
  Place: typeof google.maps.places.Place,
  listings: MapListing[],
  current: () => boolean,
) {
  const addresses = new Map<string, MapListing[]>();
  for (const listing of listings) {
    const group = addresses.get(listing.placeId);
    if (group) group.push(listing);
    else addresses.set(listing.placeId, [listing]);
  }

  const entries = [...addresses];
  const points = new Map<string, MapPoint>();
  for (let offset = 0; offset < entries.length && current(); offset += 4) {
    await Promise.all(
      entries.slice(offset, offset + 4).map(async ([id, group]) => {
        try {
          const place = new Place({ id, requestedLanguage: "ro" });
          await withMapsTimeout(place.fetchFields({ fields: ["location"] }));
          const position = place.location?.toJSON();
          if (
            !current() ||
            !position ||
            !Number.isFinite(position.lat) ||
            !Number.isFinite(position.lng)
          )
            return;

          const key = `${position.lat.toFixed(6)}:${position.lng.toFixed(6)}`;
          const existing = points.get(key);
          if (existing) existing.listings.push(...group);
          else points.set(key, { position, listings: group });
        } catch {
          // A missing place must not hide listings at the other addresses.
        }
      }),
    );
  }
  return [...points.values()];
}

function addMarker(
  OverlayView: typeof google.maps.OverlayView,
  map: google.maps.Map,
  position: google.maps.LatLng,
  label: string,
  description: string,
  onSelect: () => void,
) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "discovery-map-marker";
  button.textContent = label;
  button.setAttribute("aria-label", description);
  button.addEventListener("click", onSelect);
  OverlayView.preventMapHitsAndGesturesFrom(button);

  const overlay = new OverlayView();
  overlay.onAdd = () => {
    overlay.getPanes()?.overlayMouseTarget.append(button);
  };
  overlay.draw = () => {
    const pixel = overlay.getProjection().fromLatLngToDivPixel(position);
    if (!pixel) return;
    button.style.left = `${pixel.x}px`;
    button.style.top = `${pixel.y}px`;
  };
  overlay.onRemove = () => button.remove();
  overlay.setMap(map);
  return overlay;
}

type Status = "waiting" | "loading" | "ready" | "error";

export function DiscoveryResultsMap({
  listings,
  resultCount,
}: {
  listings: MapListing[];
  resultCount: number;
}) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<Status>("waiting");
  const [attempt, setAttempt] = useState(0);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const enabled = mapsEnabled() && listings.length > 0;

  useEffect(() => {
    if (!enabled || !section.current) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setVisible(true);
        }
      },
      { rootMargin: "140px" },
    );
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    if (!visible || !enabled || !canvas.current) return;
    const node = canvas.current;
    let current = true;
    let failed = false;
    const markers: google.maps.OverlayView[] = [];
    const active = () => current && !failed;
    const unavailable = () => {
      failed = true;
      if (current) {
        setStatus("error");
        setSelected(null);
      }
    };
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setSelected(null);
      try {
        const maps = await loadGoogleMaps();
        const [mapsLibrary, places, core] = await withMapsTimeout(
          Promise.all([
            maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
            maps.importLibrary("places") as Promise<google.maps.PlacesLibrary>,
            maps.importLibrary("core") as Promise<google.maps.CoreLibrary>,
          ]),
        );
        if (!active()) return;
        const points = await locateListings(places.Place, listings, active);
        if (!active()) return;
        if (!points.length) {
          unavailable();
          return;
        }
        const map = new mapsLibrary.Map(node, {
          center: points[0].position,
          zoom: 14,
          renderingType: mapsLibrary.RenderingType.RASTER,
          styles: resultMapStyle,
          clickableIcons: false,
          gestureHandling: "cooperative",
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
        });
        const bounds = new core.LatLngBounds();
        for (const point of points) {
          const position = new core.LatLng(point.position);
          const first = point.listings[0];
          const label =
            point.listings.length > 1
              ? `${point.listings.length} proprietăți`
              : first.price;
          bounds.extend(position);
          markers.push(
            addMarker(
              mapsLibrary.OverlayView,
              map,
              position,
              label,
              point.listings.length > 1
                ? label
                : `${first.title}, ${first.price}`,
              () => {
                if (active()) setSelected(point);
              },
            ),
          );
        }
        if (points.length > 1) map.fitBounds(bounds, 54);
        setCount(
          points.reduce((total, point) => total + point.listings.length, 0),
        );
        setStatus("ready");
      } catch {
        if (current) unavailable();
      }
    }, 0);
    window.addEventListener("mbp-maps-error", unavailable);
    return () => {
      current = false;
      window.clearTimeout(timer);
      window.removeEventListener("mbp-maps-error", unavailable);
      markers.forEach((marker) => marker.setMap(null));
      node.replaceChildren();
    };
  }, [attempt, enabled, listings, visible]);

  return (
    <aside
      ref={section}
      className="discovery-results-map"
      aria-label="Harta proprietăților"
    >
      <div ref={canvas} className="discovery-map-canvas" />
      {enabled && (status === "loading" || status === "waiting") && (
        <div className="discovery-map-status" role="status">
          <MapPin size={27} aria-hidden="true" />
          <p>Încărcăm proprietățile pe hartă…</p>
        </div>
      )}
      {(!enabled || status === "error") && (
        <div className="discovery-map-status" role="status">
          <MapPin size={28} aria-hidden="true" />
          <p>
            {!listings.length
              ? "Anunțurile de pe această pagină nu au încă o adresă localizată pe hartă."
              : "Harta este momentan indisponibilă."}
          </p>
          {enabled && status === "error" && (
            <button
              type="button"
              className="discovery-primary"
              onClick={() => setAttempt(attempt + 1)}
            >
              Reîncarcă harta
            </button>
          )}
        </div>
      )}
      {enabled && status === "ready" && (
        <>
          <div className="discovery-map-count">
            <House size={22} aria-hidden="true" />
            <div>
              <strong>
                {count} {count === 1 ? "proprietate" : "proprietăți"} pe hartă
              </strong>
              {count < resultCount && (
                <span>Din {resultCount} rezultate afișate</span>
              )}
            </div>
          </div>
          {selected && (
            <section
              className="discovery-map-selection"
              aria-label="Proprietăți la această adresă"
            >
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Închide detaliile de pe hartă"
              >
                <X size={17} aria-hidden="true" />
              </button>
              <ul>
                {selected.listings.map((listing) => (
                  <li key={listing.href}>
                    <Link
                      href={listing.href}
                      target="_blank"
                      rel="noopener"
                      prefetch={false}
                    >
                      <strong>{listing.title}</strong>
                      <span>
                        {listing.price}{" "}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <a href="#rezultate" className="discovery-map-list">
        <List size={15} aria-hidden="true" /> Vezi lista
      </a>
    </aside>
  );
}
