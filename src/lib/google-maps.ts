// Browser-only integration. This is a domain-restricted public browser key,
// never a server/service-account key. No Google requests occur on import.
import { mapsEnabled } from "./property-location";

let loading: Promise<typeof google.maps> | undefined;
type MapsWindow = Window & {
  google?: typeof google;
  mbpGoogleMapsReady?: () => void;
  gm_authFailure?: () => void;
};

export function withMapsTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Google Maps did not respond. Please try again.")),
      15000,
    );
    promise.then(resolve, reject).finally(() => clearTimeout(timeout));
  });
}

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined" || !mapsEnabled())
    return Promise.reject(new Error("Maps are not available."));
  const browser = window as MapsWindow;
  if (browser.google?.maps?.importLibrary)
    return Promise.resolve(browser.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => fail(), 15000);
    function fail() {
      clearTimeout(timeout);
      script.remove();
      loading = undefined;
      reject(
        new Error("Google Maps could not load. You can still use the address."),
      );
    }
    browser.mbpGoogleMapsReady = () => {
      clearTimeout(timeout);
      if (browser.google?.maps) resolve(browser.google.maps);
      else fail();
    };
    browser.gm_authFailure = () => {
      window.dispatchEvent(new Event("mbp-maps-error"));
      fail();
    };
    const params = new URLSearchParams({
      key: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!.trim(),
      v: "quarterly",
      language: "en",
      region: "US",
      loading: "async",
      callback: "mbpGoogleMapsReady",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}
