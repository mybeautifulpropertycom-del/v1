import { BrandSymbol } from "./brand-symbol";

export function Brand({
  light = false,
  uniformDesktopWordmark = false,
}: {
  light?: boolean;
  uniformDesktopWordmark?: boolean;
}) {
  return (
    <span className={light ? "brand brand-light" : "brand"}>
      <BrandSymbol />
      <span>
        <span className={uniformDesktopWordmark ? "brand-property" : undefined}>
          Următoarea
        </span>{" "}
        <span className="brand-property">Proprietate</span>
      </span>
    </span>
  );
}
