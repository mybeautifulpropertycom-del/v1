import { BrandSymbol } from "./brand-symbol";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={light ? "brand brand-light" : "brand"}>
      <BrandSymbol />
      <span>
        Următoarea <span className="brand-property">Proprietate</span>
      </span>
    </span>
  );
}
