"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { loadGoogleMaps, withMapsTimeout } from "@/lib/google-maps";
import { mapsEnabled } from "@/lib/property-location";
import { bucharestPromotionCenter } from "@/lib/promotion-packages";

export function PromotionRadiusMap({ radius }: { radius: number }) {
  const container = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<{
    map: google.maps.Map;
    circle: google.maps.Circle;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const enabled = mapsEnabled();

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let circle: google.maps.Circle | undefined;
    function onError() {
      if (!closed) setFailed(true);
    }
    window.addEventListener("mbp-maps-error", onError);
    void loadGoogleMaps()
      .then((maps) =>
        withMapsTimeout(
          maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        ),
      )
      .then(({ Map, Circle }) => {
        if (closed || !container.current) return;
        const map = new Map(container.current, {
          center: bucharestPromotionCenter,
          zoom: 10,
          gestureHandling: "cooperative",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        });
        circle = new Circle({
          map,
          center: bucharestPromotionCenter,
          strokeColor: "#426445",
          fillColor: "#71996b",
          fillOpacity: 0.24,
          clickable: false,
        });
        setOverlay({ map, circle });
      })
      .catch(onError);
    return () => {
      closed = true;
      circle?.setMap(null);
      window.removeEventListener("mbp-maps-error", onError);
    };
  }, [enabled]);

  useEffect(() => {
    if (!overlay) return;
    overlay.circle.setRadius(radius * 1000);
    const bounds = overlay.circle.getBounds();
    if (bounds) overlay.map.fitBounds(bounds, 24);
  }, [overlay, radius]);

  return (
    <div className="promotion-radius-map">
      {enabled && !failed ? (
        <div
          ref={container}
          className="promotion-radius-canvas"
          role="region"
          aria-label={`Hartă cu raza de ${radius} km în jurul centrului Bucureștiului`}
        />
      ) : (
        <div className="promotion-radius-fallback">
          <MapPin size={18} aria-hidden="true" />
          <p>
            Harta nu este disponibilă momentan. Raza aleasă se salvează în
            setările campaniei.
          </p>
        </div>
      )}
      <small>Centru București · rază de {radius} km</small>
    </div>
  );
}
