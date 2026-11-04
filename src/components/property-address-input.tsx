"use client";
import { useEffect, useId, useRef, useState } from "react";
import { loadGoogleMaps, withMapsTimeout } from "@/lib/google-maps";
import { isUSAddress, mapsEnabled, PLACE_ID } from "@/lib/property-location";

export function PropertyAddressInput({
  value,
  placeId,
  disabled,
  onChange,
}: {
  value: string;
  placeId?: string | null;
  disabled?: boolean;
  onChange: (address: string, placeId: string | null) => void;
}) {
  const id = useId();
  const enabled = mapsEnabled();
  const [focused, setFocused] = useState(false);
  const [predictions, setPredictions] = useState<
    google.maps.places.PlacePrediction[]
  >([]);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );
  const selecting = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef({ value, disabled });
  latest.current = { value, disabled };

  useEffect(() => {
    const request = ++revision.current;
    setPredictions([]);
    setActive(-1);
    if (
      !enabled ||
      !focused ||
      disabled ||
      placeId ||
      value.trim().length < 4 ||
      selecting.current
    )
      return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const maps = await loadGoogleMaps();
        const places = (await maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
        if (cancelled) return;
        session.current ??= new places.AutocompleteSessionToken();
        const response = await withMapsTimeout(
          places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input: value.trim(),
            includedRegionCodes: ["us"],
            language: "en",
            region: "us",
            sessionToken: session.current,
          }),
        );
        if (cancelled || request !== revision.current) return;
        setPredictions(
          response.suggestions
            .flatMap((s) => (s.placePrediction ? [s.placePrediction] : []))
            .slice(0, 5),
        );
      } catch {
        if (!cancelled && request === revision.current)
          setError(
            "Address suggestions are unavailable. You can still enter and save the address.",
          );
      } finally {
        if (!cancelled && request === revision.current) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, focused, disabled, placeId, enabled]);

  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );

  async function choose(prediction: google.maps.places.PlacePrediction) {
    if (selecting.current || disabled) return;
    selecting.current = true;
    const request = ++revision.current;
    const addressAtSelection = latest.current.value;
    setLoading(true);
    setError("");
    setPredictions([]);
    try {
      const place = prediction.toPlace();
      await withMapsTimeout(
        place.fetchFields({
          fields: ["id", "formattedAddress", "addressComponents", "types"],
        }),
      );
      if (
        request !== revision.current ||
        latest.current.value !== addressAtSelection ||
        latest.current.disabled
      )
        return;
      if (
        !isUSAddress(place) ||
        !place.formattedAddress ||
        place.formattedAddress.length > 200 ||
        !PLACE_ID.test(place.id)
      ) {
        setError(
          "Choose a full US street address or building, rather than a city or region.",
        );
        return;
      }
      onChange(place.formattedAddress, place.id);
      setFocused(false);
      input.current?.focus();
    } catch {
      if (request === revision.current)
        setError(
          "This address could not be confirmed. Please try again or enter it manually.",
        );
    } finally {
      session.current = null;
      selecting.current = false;
      if (request === revision.current) setLoading(false);
    }
  }

  const open = focused && predictions.length > 0;
  return (
    <div className="property-address-field full-width">
      <label htmlFor={id}>Address</label>
      <input
        ref={input}
        id={id}
        value={value}
        maxLength={200}
        disabled={disabled}
        placeholder="123 Palm Drive, Beverly Hills, CA"
        autoComplete="off"
        role={enabled ? "combobox" : undefined}
        aria-autocomplete={enabled ? "list" : undefined}
        aria-expanded={enabled ? open : undefined}
        aria-controls={open ? `${id}-results` : undefined}
        aria-activedescendant={
          open && active >= 0 ? `${id}-option-${active}` : undefined
        }
        aria-describedby={`${id}-hint`}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setLoading(false);
        }}
        onChange={(e) => {
          revision.current++;
          setLoading(false);
          setError("");
          setFocused(true);
          onChange(e.target.value, null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setFocused(false);
            setPredictions([]);
          }
          if (!open) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive((previous) =>
              previous < 0
                ? e.key === "ArrowDown"
                  ? 0
                  : predictions.length - 1
                : (previous +
                    (e.key === "ArrowDown" ? 1 : predictions.length - 1)) %
                  predictions.length,
            );
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (active >= 0) void choose(predictions[active]);
          }
        }}
      />
      {open && (
        <div className="property-address-results">
          <ul
            id={`${id}-results`}
            role="listbox"
            aria-label="Suggested US addresses"
          >
            {predictions.map((prediction, index) => (
              <li
                key={prediction.placeId}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(prediction)}
              >
                {prediction.text.toString()}
              </li>
            ))}
          </ul>
          <span className="maps-attribution">Google Maps</span>
        </div>
      )}
      <small id={`${id}-hint`}>
        {enabled
          ? placeId
            ? "Address selected. Check its map position below before publishing."
            : "Search a US street address and choose a suggestion to add a map. The address also becomes your public link."
          : "Enter the property’s address. It appears on the website and becomes its public link when you publish."}
      </small>
      {enabled && (
        <small role="status">
          {error || (loading ? "Finding the address…" : "")}
        </small>
      )}
    </div>
  );
}
