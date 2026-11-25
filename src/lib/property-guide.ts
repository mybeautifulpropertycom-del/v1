import {
  isReservedPropertyAddress,
  propertyRoomIssues,
  propertyTypeOptions,
  type Property,
} from "./model";

export const propertyGuideFields = [
  {
    id: "title",
    title: "Denumirea locuinței",
    body: "Denumirea apare la începutul prezentării. Alege un titlu de cel puțin 5 caractere.",
  },
  {
    id: "location",
    title: "Adresa proprietății",
    body: "Adaugă adresa completă. Aceasta apare în prezentare și stabilește locația de pe hartă.",
  },
  {
    id: "type",
    title: "Tipul proprietății",
    body: "Alege tipul locuinței pe care o prezinți. Poți păstra valoarea selectată dacă este potrivită.",
  },
  {
    id: "transaction",
    title: "Tipul ofertei",
    body: "Alege dacă proprietatea este de vânzare sau de închiriat.",
  },
  {
    id: "price",
    title: "Prețul proprietății",
    body: "Introdu prețul de vânzare sau chiria, în moneda aleasă.",
  },
  {
    id: "currency",
    title: "Moneda",
    body: "Confirmă moneda în care este exprimat prețul proprietății.",
  },
  {
    id: "area",
    title: "Suprafața locuinței",
    body: "Introdu suprafața locuinței în metri pătrați.",
  },
  {
    id: "bedrooms",
    title: "Dormitoarele",
    body: "Adaugă numărul de dormitoare. Pentru o locuință fără dormitor separat, poți introduce zero.",
  },
  {
    id: "bathrooms",
    title: "Băile",
    body: "Alege numărul de băi din listă.",
  },
  {
    id: "description",
    title: "Spune povestea locuinței",
    body: "Notează compartimentarea, renovările și detaliile pe care vrei să le remarce vizitatorii. Aceste notițe ghidează textele prezentării.",
    optional: true,
  },
  {
    id: "amenities",
    title: "Dotări și facilități",
    body: "Selectează facilitățile proprietății sau adaugă dotări personalizate. Poți alege mai multe, apoi continua.",
    optional: true,
  },
] as const;

export type PropertyGuideField = (typeof propertyGuideFields)[number]["id"];

// Moving further through the form also accepts valid defaults before that
// field. Invalid required facts stay pending; optional sections stay optional.
export function completePropertyGuideThrough(
  completed: ReadonlySet<string>,
  issues: Partial<Record<PropertyGuideField, string | null | undefined>>,
  id: PropertyGuideField,
) {
  const next = new Set(completed);
  const index = propertyGuideFields.findIndex((field) => field.id === id);
  for (const field of propertyGuideFields.slice(0, index + 1))
    if (!issues[field.id]) next.add(field.id);
  return next;
}

export function nextPropertyGuideField(
  completed: ReadonlySet<string>,
  issues: Partial<Record<PropertyGuideField, string | null>>,
) {
  return (
    propertyGuideFields.find(
      (field) => !completed.has(field.id) || Boolean(issues[field.id]),
    ) ?? null
  );
}

export function propertyGuideIssues(
  property: Property,
  saved?: Property,
): Record<PropertyGuideField | "area_unit", string | null> {
  return {
    title:
      property.title.trim().length < 5
        ? "Adaugă un titlu de minimum 5 caractere."
        : property.title.length > 160
          ? "Titlul poate avea maximum 160 de caractere."
          : null,
    location: !property.location.trim()
      ? "Adaugă adresa proprietății."
      : isReservedPropertyAddress(property.location)
        ? "Introdu adresa completă a proprietății, inclusiv strada și numărul."
        : property.location.length > 200
          ? "Adresa poate avea maximum 200 de caractere."
          : null,
    type: [...propertyTypeOptions, "Town House", "Land"].includes(property.type)
      ? null
      : "Alege tipul proprietății.",
    transaction: ["sale", "rent"].includes(property.transaction)
      ? null
      : "Alege tipul ofertei.",
    price:
      !Number.isFinite(property.price) || property.price <= 0
        ? "Adaugă un preț mai mare decât zero."
        : property.price > 999999999999
          ? "Introdu un preț valid."
          : null,
    currency: ["EUR", "RON", "USD"].includes(property.currency)
      ? null
      : "Alege moneda prețului.",
    area:
      !Number.isFinite(property.area) || property.area <= 0
        ? "Adaugă suprafața proprietății."
        : property.area > 999999999
          ? "Introdu o suprafață validă."
          : null,
    area_unit: ["sqm", "sqft"].includes(property.area_unit)
      ? null
      : "Alege unitatea de suprafață.",
    ...propertyRoomIssues(property, saved),
    description:
      property.description.length <= 12000
        ? null
        : "Scurtează notițele la maximum 12.000 de caractere.",
    amenities:
      property.amenities.length <= 30
        ? null
        : "Poți adăuga maximum 30 de dotări.",
  };
}
