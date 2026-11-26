"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import type { PublicProfile } from "@/lib/model";
import {
  PropertyWhatsAppLink,
  whatsappPhoneNumber,
} from "./property-whatsapp-link";
import "@/styles/property-mobile-contact.css";

export function PropertyMobileContact({
  phone,
  location,
  profileRole,
  startSection = "details",
}: {
  phone: string;
  location: string;
  profileRole: PublicProfile["profile_role"];
  startSection?: "details" | "gallery";
}) {
  const number = whatsappPhoneNumber(phone);
  const bar = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<"hidden" | "content" | "footer">(
    "hidden",
  );

  useEffect(() => {
    if (!number) return;
    const page = bar.current?.parentElement;
    const start = page?.querySelector(`#${startSection}`);
    const contact = page?.querySelector("#contact");
    const footer = page?.querySelector(".property-footer");
    if (!page || !start || !contact || !footer) return;

    const mobile = window.matchMedia("(max-width: 767px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!mobile.matches) {
        setPosition("hidden");
        return;
      }
      const bottom = window.innerHeight;
      const footerRect = footer.getBoundingClientRect();
      const beforeContact =
        start.getBoundingClientRect().top < bottom &&
        contact.getBoundingClientRect().top >= bottom;
      // A tall phone may still show the end of the contact form above the footer.
      const atFooter = footerRect.top < bottom && footerRect.bottom > 0;
      setPosition(atFooter ? "footer" : beforeContact ? "content" : "hidden");
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(page);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [number, startSection]);

  if (!number) return null;

  return (
    <aside
      ref={bar}
      className="property-mobile-contact"
      aria-label="Contact rapid"
      hidden={position === "hidden"}
      data-position={position}
    >
      <PropertyWhatsAppLink phone={phone} location={location} compact />
      <a className="property-mobile-call" href={`tel:+${number}`}>
        <Phone size={16} aria-hidden="true" />
        {profileRole === "owner"
          ? "Apelează proprietarul"
          : "Apelează vânzătorul"}
      </a>
    </aside>
  );
}
