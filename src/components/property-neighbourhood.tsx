"use client";
import { useLayoutEffect, useId, useRef, useState } from "react";
import { ImageIcon, MapPin } from "lucide-react";
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

function PlacePhoto({
  name,
  resolvePhoto,
}: {
  name: string;
  resolvePhoto: (
    refresh: boolean,
  ) => Promise<google.maps.places.Photo | undefined>;
}) {
  const [photo, setPhoto] = useState<google.maps.places.Photo>();
  const [src, setSrc] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "loaded" | "empty" | "error"
  >("idle");
  const pending = useRef(false);
  const active = useRef(true);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  async function showPhoto() {
    if (pending.current) return;
    pending.current = true;
    const refresh = status === "error";
    setStatus("loading");
    try {
      const nextPhoto = await resolvePhoto(refresh);
      if (!active.current) return;
      if (!nextPhoto) {
        setStatus("empty");
        return;
      }
      const uri = nextPhoto.getURI({ maxWidth: 400, maxHeight: 240 });
      if (!uri) throw new Error("Missing photo URL");
      setPhoto(nextPhoto);
      setSrc(uri);
    } catch {
      if (active.current) setStatus("error");
    } finally {
      pending.current = false;
    }
  }

  if (status === "empty")
    return (
      <div className="neighbourhood-photo-empty">
        <ImageIcon size={24} />
        <span>No photo provided for this place.</span>
      </div>
    );
  return (
    <div className="neighbourhood-photo">
      {src ? (
        <>
          {/* Direct provider image: never cache Google photos through Next/Image or our storage. */}
          <img
            src={src}
            alt={name}
            width={400}
            height={240}
            onLoad={() => setStatus("loaded")}
            onError={() => {
              setSrc("");
              setStatus("error");
            }}
          />
          <div className="neighbourhood-photo-credit">
            {photo?.authorAttributions.map((author, index) => {
              const href = safeExternalUrl(author.uri);
              return href ? (
                <a
                  key={index}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {author.displayName}
                </a>
              ) : (
                <span key={index}>{author.displayName}</span>
              );
            })}
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={status === "loading"}
          onClick={() => void showPhoto()}
        >
          <ImageIcon size={24} />
          <span>
            {status === "loading"
              ? "Loading photo…"
              : status === "error"
                ? `Retry photo of ${name}`
                : `Show photo of ${name}`}
          </span>
        </button>
      )}
      {status === "error" && (
        <p role="status" className="neighbourhood-photo-error">
          The photo could not load. Please try again.
        </p>
      )}
    </div>
  );
}

function Neighbourhood({ property }: { property: MappedProperty }) {
  const heading = useId();
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
  const photoRequests = useRef(
    new Map<string, Promise<google.maps.places.Photo | undefined>>(),
  );
  const [opened, setOpened] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<NearbyCategory | null>(null);
  const [places, setPlaces] = useState<google.maps.places.Place[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  // Register lifetime cleanup before a visitor can start the first request.
  useLayoutEffect(() => {
    setInteractive(true);
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

  function resolvePhoto(place: google.maps.places.Place, refresh: boolean) {
    if (!refresh && place.photos?.[0]) return Promise.resolve(place.photos[0]);
    if (refresh) photoRequests.current.delete(place.id);
    const existing = photoRequests.current.get(place.id);
    if (existing) return existing;
    const request = (async () => {
      const maps = await loadGoogleMaps();
      const { Place } = (await maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const details = new Place({ id: place.id, requestedLanguage: "en" });
      await withMapsTimeout(details.fetchFields({ fields: ["photos"] }));
      return details.photos?.[0];
    })().catch((error: unknown) => {
      photoRequests.current.delete(place.id);
      throw error;
    });
    photoRequests.current.set(place.id, request);
    return request;
  }

  function focusPlace(place: google.maps.places.Place) {
    setSelected(place.id);
    if (place.location && map.current) {
      map.current.panTo(place.location);
      map.current.setZoom(15);
    }
  }

  async function openMap() {
    if (opening.current || ready) return;
    opening.current = true;
    const request = ++currentRequest.current;
    setOpened(true);
    setBusy(true);
    setError("");
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
      setReady(true);
    } catch {
      if (request === currentRequest.current)
        setError("The map is unavailable right now. Please try again shortly.");
    } finally {
      opening.current = false;
      if (request === currentRequest.current) setBusy(false);
    }
  }

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
            fields: ["id", "displayName", "location", "photos", "attributions"],
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
    <section className="property-neighbourhood" aria-labelledby={heading}>
      <div className="neighbourhood-heading">
        <div>
          <span className="neighbourhood-kicker">AROUND YOUR NEXT HOME</span>
          <h2 id={heading}>Explore the neighborhood.</h2>
          <p>{property.location}</p>
        </div>
      </div>
      {!ready && (
        <div className="neighbourhood-intro">
          <MapPin size={30} strokeWidth={1.3} />
          <p>
            Find your bearings. Explore schools, parks, shops and places to
            visit nearby.
          </p>
          <button
            className="neighbourhood-button"
            type="button"
            disabled={busy || !interactive}
            onClick={() => void openMap()}
          >
            {busy ? "Opening map…" : "Show map"}
          </button>
          <small>Loads Google Maps when you choose to explore.</small>
        </div>
      )}
      <div
        ref={mapContainer}
        className="neighbourhood-map"
        hidden={!opened}
        aria-label="Property and nearby places map"
      />
      {ready && (
        <>
          <div
            className="neighbourhood-categories"
            role="group"
            aria-label="Explore nearby places"
          >
            {nearbyCategories.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={category?.id === item.id}
                disabled={busy}
                onClick={() => void explore(item)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="neighbourhood-note">
            {category
              ? `Up to ${NEARBY_LIMIT} nearby places within approximately 3 miles.`
              : "Choose a category to see nearby places."}{" "}
            Distances are straight-line estimates, not walking or driving
            routes.
          </p>
          {busy && <p role="status">Finding nearby places…</p>}
          {!busy && category && !places.length && !error && (
            <p role="status">
              No {category.label.toLowerCase()} were returned nearby. Try
              another category.
            </p>
          )}
          <div className="neighbourhood-cards">
            {places.map((place, index) => (
              <article
                key={`${category?.id}:${place.id}`}
                className={`neighbourhood-card${selected === place.id ? " is-selected" : ""}`}
              >
                <PlacePhoto
                  resolvePhoto={(refresh) => resolvePhoto(place, refresh)}
                  name={place.displayName || "Nearby place"}
                />
                <div className="neighbourhood-card-copy">
                  <button
                    type="button"
                    onClick={() => focusPlace(place)}
                    aria-pressed={selected === place.id}
                  >
                    <span>{index + 1}</span>
                    {place.displayName || "Nearby place"}
                  </button>
                  <p>
                    {distanceMiles(
                      centre.current!,
                      place.location!.toJSON(),
                    ).toFixed(1)}{" "}
                    mi away · straight-line distance
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
          {category && (
            <p className="neighbourhood-note">
              Places from Google Maps. Results may be incomplete. School
              proximity does not establish enrollment eligibility or attendance
              boundaries.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="status" className="neighbourhood-error">
          {error}
        </p>
      )}
    </section>
  );
}
