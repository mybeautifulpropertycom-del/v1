"use client";
import { presentationCopy } from "@/lib/presentation-copy";
import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import type { PublicProperty } from "@/lib/model";
import { loadGoogleMaps, withMapsTimeout } from "@/lib/google-maps";
import {
  TEMPLATE_LOCATION,
  TEMPLATE_LOCATION_QUERY,
  isTemplateAddress,
} from "@/lib/template-location";
import {
  distanceKilometers,
  isRomanianAddress,
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
  sample = false,
}: {
  property: MappedProperty;
  sample?: boolean;
}) {
  const hasSavedPlace = Boolean(
    property.google_place_id && PLACE_ID.test(property.google_place_id),
  );
  const resolveSampleAddress =
    sample && property.location === TEMPLATE_LOCATION && !hasSavedPlace;
  // Ordinary listings still require an agent-selected place ID.
  if (!mapsEnabled() || (!hasSavedPlace && !resolveSampleAddress)) return null;
  // Remount on address changes: a pending request must never populate a new listing.
  return (
    <Neighbourhood
      key={`${resolveSampleAddress}:${property.google_place_id}:${property.location}`}
      property={property}
      resolveSampleAddress={resolveSampleAddress}
    />
  );
}

function Neighbourhood({
  property,
  resolveSampleAddress,
}: {
  property: MappedProperty;
  resolveSampleAddress: boolean;
}) {
  const heading = useId();
  const section = useRef<HTMLElement>(null);
  const startMap = useRef<() => void>(() => {});
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const centre = useRef<google.maps.LatLngLiteral | null>(null);
  const homePlaceId = useRef<string | null>(null);
  const samplePlaceId = useRef<string | null>(null);
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
      setError(
        "Harta nu este disponibilă momentan. Încearcă din nou în câteva momente.",
      );
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
      let placeId = property.google_place_id;
      if (resolveSampleAddress) {
        placeId = samplePlaceId.current;
        if (!placeId) {
          const response = await withMapsTimeout(
            placesLibrary.Place.searchByText({
              textQuery: TEMPLATE_LOCATION_QUERY,
              fields: ["id"],
              maxResultCount: 1,
              language: "ro",
              region: "ro",
            }),
          );
          if (request !== currentRequest.current) return;
          placeId = response.places[0]?.id;
        }
      }
      if (!placeId || !PLACE_ID.test(placeId))
        throw new Error("Adresa nu a putut fi localizată.");
      const home = new placesLibrary.Place({
        id: placeId,
        requestedLanguage: "ro",
      });
      await withMapsTimeout(
        home.fetchFields({
          fields: ["location", "addressComponents", "types"],
        }),
      );
      if (request !== currentRequest.current || !mapContainer.current) return;
      if (
        !home.location ||
        !isRomanianAddress(home) ||
        (resolveSampleAddress && !isTemplateAddress(home))
      )
        throw new Error("Adresa nu a putut fi localizată.");
      if (resolveSampleAddress) samplePlaceId.current = home.id;
      homePlaceId.current = home.id;
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
      const markerTitle = resolveSampleAddress
        ? "Adresă demonstrativă"
        : "Următoarea ta locuință";
      label.textContent = markerTitle;
      homeMarker.current = new markerLibrary.AdvancedMarkerElement({
        map: map.current,
        position: centre.current,
        title: markerTitle,
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
        setError(
          "Harta nu este disponibilă momentan. Încearcă din nou în câteva momente.",
        );
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
            language: "ro",
            region: "ro",
          }),
        );
        nearby = response.places.filter(
          (place) => place.location && place.id !== homePlaceId.current,
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
          title: place.displayName || "Loc din apropiere",
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
        setError(
          "Locurile din apropiere nu au putut fi încărcate. Încearcă din nou categoria.",
        );
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
        <span className="neighbourhood-kicker">
          ÎN APROPIEREA VIITOAREI TALE LOCUINȚE
        </span>
        <h2 id={heading}>{presentationCopy.neighbourhood}</h2>
        <p>{property.location}</p>
      </div>
      <div className="neighbourhood-layout">
        <div className="neighbourhood-map-wrap">
          <div
            ref={mapContainer}
            className="neighbourhood-map"
            aria-label="Harta proprietății și a locurilor din apropiere"
          />
          {!ready && (
            <div className="neighbourhood-map-status">
              <p role="status">{error || "Se încarcă harta cartierului…"}</p>
              {error && (
                <button
                  type="button"
                  className="neighbourhood-button"
                  disabled={busy}
                  onClick={() => void openMap()}
                >
                  Reîncarcă harta
                </button>
              )}
            </div>
          )}
        </div>
        <div className="neighbourhood-panel">
          <h3>Locuri aproape de noua ta locuință.</h3>
          <div
            className="neighbourhood-categories"
            role="group"
            aria-label="Descoperă locurile din apropiere"
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
            Până la {NEARBY_LIMIT} locuri în apropiere, pe o rază de aproximativ
            5 km. Distanțele sunt estimate în linie dreaptă.
          </p>
          <div className="neighbourhood-results" aria-busy={busy}>
            {ready && busy && (
              <p role="status">Se caută locuri din apropiere…</p>
            )}
            {ready && !busy && !places.length && !error && (
              <p role="status">
                Nu au fost găsite locuri din categoria{" "}
                {category.label.toLowerCase()} în apropiere. Încearcă altă
                categorie.
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
                  Reîncarcă locurile
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
                      <span>{place.displayName || "Loc din apropiere"}</span>
                    </button>
                    <p>
                      {distanceKilometers(
                        centre.current!,
                        place.location!.toJSON(),
                      ).toLocaleString("ro-RO", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      km distanță
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
              Locuri din Google Maps. Rezultatele pot fi incomplete.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
