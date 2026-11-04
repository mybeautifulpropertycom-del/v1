"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import type { PublicProperty } from "@/lib/model";
import { loadGoogleMaps, withMapsTimeout } from "@/lib/google-maps";
import {
  distanceMiles,
  isUSAddress,
  mapsEnabled,
  nearbyCategories,
  NEARBY_LIMIT,
  NEARBY_RADIUS_METERS,
  PLACE_ID,
  safeExternalUrl,
  type NearbyCategory,
} from "@/lib/property-location";

type MappedProperty = Pick<PublicProperty, "location" | "google_place_id">;
export function PropertyNeighbourhood({
  property,
}: {
  property: MappedProperty;
}) {
  if (
    !mapsEnabled() ||
    !property.google_place_id ||
    !PLACE_ID.test(property.google_place_id)
  )
    return null;
  // Remount on address changes: a pending request must never populate a new listing.
  return (
    <Neighbourhood
      key={`${property.google_place_id}:${property.location}`}
      property={property}
    />
  );
}

function Neighbourhood({ property }: { property: MappedProperty }) {
  const heading = useId();
  const section = useRef<HTMLElement>(null);
  const startMap = useRef<() => void>(() => {});
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const centre = useRef<google.maps.LatLngLiteral | null>(null);
  const homeMarker = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );
  const markers = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const currentRequest = useRef(0);
  const opening = useRef(false);
  const searching = useRef(false);
  // Ephemeral UI state only. No database/localStorage caching of Places content.
  const results = useRef(new Map<string, google.maps.places.Place[]>());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<NearbyCategory>(nearbyCategories[0]);
  const [places, setPlaces] = useState<google.maps.places.Place[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Register lifetime cleanup before a visitor can start the first request.
  useLayoutEffect(() => {
    const failed = () =>
      setError("The map is unavailable right now. Please try again shortly.");
    window.addEventListener("mbp-maps-error", failed);
    return () => {
      currentRequest.current++;
      window.removeEventListener("mbp-maps-error", failed);
      markers.current.forEach((marker) => {
        marker.map = null;
      });
      if (homeMarker.current) homeMarker.current.map = null;
    };
  }, []);

  // Only load when the visitor approaches this section. Deferring startup also
  // lets React's development effect replay clean up before any paid request.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      timer = setTimeout(() => startMap.current(), 0);
    };
    if (!("IntersectionObserver" in window)) {
      start();
      return () => clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: "200px" },
    );
    if (section.current) observer.observe(section.current);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  function focusPlace(place: google.maps.places.Place) {
    setSelected(place.id);
    if (place.location && map.current) {
      map.current.panTo(place.location);
      map.current.setZoom(15);
    }
  }

  async function openMap() {
    if (opening.current || map.current) return;
    opening.current = true;
    const request = ++currentRequest.current;
    setBusy(true);
    setError("");
    let initialized = false;
    try {
      const maps = await loadGoogleMaps();
      const [mapsLibrary, placesLibrary, markerLibrary] = await withMapsTimeout(
        Promise.all([
          maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          maps.importLibrary("places") as Promise<google.maps.PlacesLibrary>,
          maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
        ]),
      );
      if (request !== currentRequest.current) return;
      const home = new placesLibrary.Place({
        id: property.google_place_id!,
        requestedLanguage: "en",
      });
      await withMapsTimeout(
        home.fetchFields({
          fields: ["location", "addressComponents", "types"],
        }),
      );
      if (request !== currentRequest.current || !mapContainer.current) return;
      if (!home.location || !isUSAddress(home))
        throw new Error("The address could not be located.");
      centre.current = home.location.toJSON();
      map.current = new mapsLibrary.Map(mapContainer.current, {
        center: centre.current,
        zoom: 15,
        mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID!.trim(),
        mapTypeControl: false,
        streetViewControl: false,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      const label = document.createElement("div");
      label.className = "neighbourhood-home-pin";
      label.textContent = "Your next home";
      homeMarker.current = new markerLibrary.AdvancedMarkerElement({
        map: map.current,
        position: centre.current,
        title: "Your next home",
        content: label,
        zIndex: 100,
      });
      initialized = true;
      setReady(true);
    } catch {
      if (request === currentRequest.current) {
        if (homeMarker.current) homeMarker.current.map = null;
        map.current = null;
        mapContainer.current?.replaceChildren();
        setError("The map is unavailable right now. Please try again shortly.");
      }
    } finally {
      opening.current = false;
      if (request === currentRequest.current) setBusy(false);
    }
    if (initialized && request === currentRequest.current)
      await explore(nearbyCategories[0]);
  }

  // Keep the observer independent of category changes and render cycles.
  useLayoutEffect(() => {
    startMap.current = () => {
      void openMap();
    };
  });

  async function explore(next: NearbyCategory) {
    if (searching.current || !map.current || !centre.current) return;
    searching.current = true;
    const request = ++currentRequest.current;
    setCategory(next);
    setBusy(true);
    setError("");
    setPlaces([]);
    setSelected(null);
    markers.current.forEach((marker) => {
      marker.map = null;
    });
    markers.current = [];
    try {
      const maps = await loadGoogleMaps();
      const placesLibrary = (await maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      let nearby = results.current.get(next.id);
      if (!nearby) {
        const response = await withMapsTimeout(
          placesLibrary.Place.searchNearby({
            fields: ["id", "displayName", "location", "attributions"],
            includedTypes: [...next.types],
            maxResultCount: NEARBY_LIMIT,
            locationRestriction: {
              center: centre.current,
              radius: NEARBY_RADIUS_METERS,
            },
            rankPreference: "DISTANCE",
            language: "en",
            region: "us",
          }),
        );
        nearby = response.places.filter(
          (place) => place.location && place.id !== property.google_place_id,
        );
        if (request !== currentRequest.current) return;
        results.current.set(next.id, nearby);
      }
      if (request !== currentRequest.current) return;
      const { AdvancedMarkerElement } = (await maps.importLibrary(
        "marker",
      )) as google.maps.MarkerLibrary;
      if (request !== currentRequest.current) return;
      const bounds = new maps.LatLngBounds();
      bounds.extend(centre.current);
      nearby.forEach((place, index) => {
        const label = document.createElement("div");
        label.className = "neighbourhood-place-pin";
        label.textContent = String(index + 1);
        const marker = new AdvancedMarkerElement({
          map: map.current,
          position: place.location,
          title: place.displayName || "Nearby place",
          content: label,
        });
        marker.addListener("click", () => focusPlace(place));
        markers.current.push(marker);
        bounds.extend(place.location!);
      });
      if (nearby.length) map.current.fitBounds(bounds, 60);
      else {
        map.current.setCenter(centre.current);
        map.current.setZoom(15);
      }
      setPlaces(nearby);
    } catch {
      if (request === currentRequest.current)
        setError("Nearby places could not be loaded. Try this category again.");
    } finally {
      searching.current = false;
      if (request === currentRequest.current) setBusy(false);
    }
  }

  return (
    <section
      ref={section}
      className="property-neighbourhood"
      aria-labelledby={heading}
    >
      <div className="neighbourhood-heading">
        <span className="neighbourhood-kicker">AROUND YOUR NEXT HOME</span>
        <h2 id={heading}>Explore the neighborhood.</h2>
        <p>{property.location}</p>
      </div>
      <div className="neighbourhood-layout">
        <div className="neighbourhood-map-wrap">
          <div
            ref={mapContainer}
            className="neighbourhood-map"
            aria-label="Property and nearby places map"
          />
          {!ready && (
            <div className="neighbourhood-map-status">
              <p role="status">{error || "Loading the neighborhood map…"}</p>
              {error && (
                <button
                  type="button"
                  className="neighbourhood-button"
                  disabled={busy}
                  onClick={() => void openMap()}
                >
                  Retry map
                </button>
              )}
            </div>
          )}
        </div>
        <div className="neighbourhood-panel">
          <h3>Everyday places, close to home.</h3>
          <div
            className="neighbourhood-categories"
            role="group"
            aria-label="Explore nearby places"
          >
            {nearbyCategories.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={category.id === item.id}
                disabled={!ready || busy}
                onClick={() => void explore(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="neighbourhood-note">
            Up to {NEARBY_LIMIT} nearby places within approximately 3 miles.{" "}
            Distances are straight-line estimates.
          </p>
          <div className="neighbourhood-results" aria-busy={busy}>
            {ready && busy && <p role="status">Finding nearby places…</p>}
            {ready && !busy && !places.length && !error && (
              <p role="status">
                No {category.label.toLowerCase()} were returned nearby. Try
                another category.
              </p>
            )}
            {ready && error && (
              <div className="neighbourhood-error">
                <p role="status">{error}</p>
                <button
                  type="button"
                  className="neighbourhood-button"
                  disabled={busy}
                  onClick={() => void explore(category)}
                >
                  Retry places
                </button>
              </div>
            )}
            <div className="neighbourhood-cards">
              {places.map((place, index) => (
                <article
                  key={`${category.id}:${place.id}`}
                  className={`neighbourhood-card${selected === place.id ? " is-selected" : ""}`}
                >
                  <div className="neighbourhood-card-copy">
                    <button
                      type="button"
                      onClick={() => focusPlace(place)}
                      aria-pressed={selected === place.id}
                    >
                      <span className="neighbourhood-place-number">
                        {index + 1}
                      </span>
                      <span>{place.displayName || "Nearby place"}</span>
                    </button>
                    <p>
                      {distanceMiles(
                        centre.current!,
                        place.location!.toJSON(),
                      ).toFixed(1)}{" "}
                      mi away
                    </p>
                    {place.attributions?.map((attribution, i) => (
                      <small key={i}>
                        {safeExternalUrl(attribution.providerURI) ? (
                          <a
                            href={safeExternalUrl(attribution.providerURI)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {attribution.provider}
                          </a>
                        ) : (
                          attribution.provider
                        )}
                      </small>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
          {ready && (
            <p className="neighbourhood-note neighbourhood-source">
              Places from Google Maps. Results may be incomplete.
              {category.id === "schools" &&
                " School proximity does not establish enrollment eligibility or attendance boundaries."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
