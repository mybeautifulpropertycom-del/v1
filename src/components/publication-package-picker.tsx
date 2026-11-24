"use client";
import {
  publicationPackages,
  type PublicationPackage,
} from "@/lib/publication-packages";

export function PublicationPackagePicker({
  value,
  onChange,
  administrator = false,
  locked = false,
  disabled = false,
}: {
  value: PublicationPackage;
  onChange: (value: PublicationPackage) => void;
  administrator?: boolean;
  locked?: boolean;
  disabled?: boolean;
}) {
  return (
    <fieldset className="publication-packages" disabled={disabled}>
      <legend>Alege varianta de publicare</legend>
      <div className="publication-package-options">
        {(["photos", "video"] as const).map((id) => {
          const offer = publicationPackages[id];
          return (
            <label
              className="publication-package"
              key={id}
              data-selected={value === id}
            >
              <input
                type="radio"
                name="publication-package"
                value={id}
                checked={value === id}
                disabled={locked && value !== id}
                onChange={() => onChange(id)}
              />
              <span className="publication-package-content">
                <span className="publication-package-name">{offer.name}</span>
                <strong>
                  {administrator || offer.price === 0 ? (
                    "Gratuit"
                  ) : (
                    <>
                      {offer.price} <small>RON</small>
                    </>
                  )}
                </strong>
                <span>{offer.description}</span>
                <small>
                  {administrator
                    ? offer.includesVideo
                      ? "Generarea videoclipului folosește credite API."
                      : "Fără generare video și fără consum de credite video."
                    : offer.price === 0
                      ? "Publicare gratuită · Fără card"
                      : "Plată unică · Fără abonament"}
                </small>
              </span>
            </label>
          );
        })}
      </div>
      {locked && (
        <p>
          Proprietatea are deja această variantă. Publicarea nu necesită o nouă
          plată.
        </p>
      )}
    </fieldset>
  );
}
