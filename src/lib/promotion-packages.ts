export const promotionPackages = {
  start: {
    id: "start",
    name: "Start",
    price: 300,
    amount: 30000,
    description:
      "Un prim buget pentru promovarea proprietății pe Google Search.",
  },
  plus: {
    id: "plus",
    name: "Plus",
    price: 500,
    amount: 50000,
    description:
      "Mai mult buget pentru vizibilitate și potențiali cumpărători sau chiriași.",
  },
  extended: {
    id: "extended",
    name: "Extins",
    price: 1000,
    amount: 100000,
    description:
      "Un buget mai mare pentru promovarea proprietății în Google Search.",
  },
} as const;
export type PromotionPackage = keyof typeof promotionPackages;
export function isPromotionPackage(value: unknown): value is PromotionPackage {
  return typeof value === "string" && Object.hasOwn(promotionPackages, value);
}
export type PromotionPaymentStatus =
  "pending" | "paid" | "refunded" | "disputed" | "cancelled";
export type PromotionCampaignStatus =
  "queued" | "preparing" | "active" | "completed" | "stopped";
export const promotionStopLabels = {
  payment: "Plata necesită verificare",
  withdrawn: "Proprietatea a fost retrasă",
  deleted: "Proprietatea a fost ștearsă",
  sold: "Proprietatea a fost vândută",
  rented: "Proprietatea a fost închiriată",
  requested: "Oprire solicitată de agent",
} as const;
export type PromotionOrder = {
  id: string;
  owner_id: string | null;
  property_id: string | null;
  package: PromotionPackage;
  amount: number;
  currency: "ron";
  livemode: boolean;
  payment_status: PromotionPaymentStatus;
  campaign_status: PromotionCampaignStatus;
  target_area: string;
  notes: string;
  snapshot: {
    title: string;
    location: string;
    public_url: string;
    name: string;
    email: string;
    phone: string;
    keywords: string[];
  };
  created_at: string;
  paid_at: string | null;
  updated_at: string;
  spent_amount: number;
  impressions: number;
  clicks: number;
  report: string;
  campaign_id: string;
  stop_required: boolean;
  stop_reason: "" | keyof typeof promotionStopLabels;
  refunded_amount: number;
};
export const campaignLabels: Record<PromotionCampaignStatus, string> = {
  queued: "În așteptarea pregătirii",
  preparing: "În pregătire",
  active: "Campanie activă",
  completed: "Campanie încheiată",
  stopped: "Campanie oprită",
};
export const paymentLabels: Record<PromotionPaymentStatus, string> = {
  pending: "Plată în așteptare",
  paid: "Plată confirmată",
  refunded: "Plată rambursată",
  disputed: "Plată contestată",
  cancelled: "Plată anulată",
};
// Romanian postal codes belong to the listing address, not the campaign area.
// Preserve meaningful numbers such as Sector 1 and the town 1 Decembrie.
export function promotionTargetArea(value: string) {
  return value
    .replace(/\b(?:RO[-\s]*)?\d{6}\b/gi, "")
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(", ");
}
export function defaultPromotionTargetArea(location: string) {
  const parts = promotionTargetArea(location)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !/^(?:rom[aâ]nia|ro)$/i.test(part));
  // The old last-part-only default lost the city when an area followed it.
  // Drop the address line, then retain the supplied city, district and locality.
  // A district such as Drumul Taberei remains intact after the street line.
  if (
    parts.length > 1 &&
    /^(?:str(?:ada)?\.?|stradela|[șşs]os(?:eaua)?\.?|bulevardul|bd\.?|b-dul|calea|aleea|intrarea|drumul|splaiul|pia[țt]a)(?:\s|$)/iu.test(
      parts[0],
    )
  )
    parts.shift();
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const areas = new Map<string, string>();
  for (const part of parts) {
    const key = normalize(part);
    if (/^(?:(?:municipiul|orasul) )?(?:bucuresti|bucharest)$/.test(key))
      areas.set("bucuresti", "București");
    else if (!areas.has(key)) areas.set(key, part);
  }
  // Only prioritise Bucharest when it is explicitly in the saved address.
  const city = areas.get("bucuresti");
  areas.delete("bucuresti");
  return [city, ...areas.values()].filter(Boolean).join(", ").slice(0, 160);
}

export function promotionKeywords(
  property: { type: string; transaction: string },
  area: string,
) {
  const type =
    (
      {
        House: "casă",
        Condo: "apartament",
        Penthouse: "penthouse",
        "Town House": "casă",
        Land: "teren",
      } as Record<string, string>
    )[property.type] || "proprietate";
  const transaction =
    property.transaction === "rent" ? "de închiriat" : "de vânzare";
  const place = promotionTargetArea(area);
  return [
    `${type} ${transaction} ${place}`.trim(),
    `${property.transaction === "rent" ? "închiriere" : "vânzare"} ${type} ${place}`.trim(),
  ];
}
