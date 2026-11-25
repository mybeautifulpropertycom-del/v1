import { ArrowUpRight, MessageCircle } from "lucide-react";
import { safePhone } from "@/lib/model";

export function PropertyWhatsAppLink({
  phone,
  location,
}: {
  phone: string;
  location: string;
}) {
  if (!/^\s*\+?[\d\s().-]+$/u.test(phone)) return null;
  const dial = safePhone(phone);
  const number = /^0[1-9]\d{8}$/u.test(dial)
    ? `40${dial.slice(1)}`
    : dial.replace(/^(?:\+|00)/u, "");
  if (!/^[1-9]\d{7,14}$/u.test(number)) return null;

  const address = location.trim().replace(/\s+/gu, " ").replace(/\.+$/u, "");
  const road =
    /^(str(?:ada)?\.?|bulevardul|b-dul|bd\.?|[șs]oseaua|calea|aleea|intrarea|splaiul|pia[țt]a)\s+/iu.exec(
      address,
    );
  const roadName = road
    ? `${/^str/iu.test(road[1]) ? "strada" : road[1].toLocaleLowerCase("ro-RO")} ${address.slice(road[0].length)}`
    : "";
  const property = roadName
    ? `proprietatea de pe ${roadName}`
    : address
      ? `proprietatea de la adresa ${address}`
      : "această proprietate";
  const text = encodeURIComponent(`Bună ziua! Sunt interesat de ${property}.`);

  return (
    <a
      href={`https://wa.me/${number}?text=${text}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <MessageCircle size={17} aria-hidden="true" />
      <span>Trimite mesaj pe WhatsApp</span>
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}
