import { BrandSymbol } from "./brand-symbol";

export function Brand({
  light = false,
  uniformWordmark = false,
}: {
  light?: boolean;
  uniformWordmark?: boolean;
}) {
  return (
    <span className={light ? "brand brand-light" : "brand"}>
      <BrandSymbol />
      <span>
        <span className={uniformWordmark ? "brand-property" : undefined}>
          Următoarea
        </span>{" "}
        <span className="brand-property">Proprietate</span>
      </span>
    </span>
  );
}
