"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import {
  PropertyWhatsAppLink,
  whatsappPhoneNumber,
} from "./property-whatsapp-link";
import "@/styles/property-mobile-contact.css";

export function PropertyMobileContact({
  phone,
  location,
}: {
  phone: string;
  location: string;
}) {
  const number = whatsappPhoneNumber(phone);
  const bar = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!number) return;
    const page = bar.current?.parentElement;
    const details = page?.querySelector("#details");
    const contact = page?.querySelector("#contact");
    const footer = page?.querySelector(".property-footer");
    if (!page || !details || !contact || !footer) return;

    const mobile = window.matchMedia("(max-width: 767px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!mobile.matches) {
        setVisible(false);
        return;
      }
      const bottom = window.innerHeight;
      const footerRect = footer.getBoundingClientRect();
      const beforeContact =
        details.getBoundingClientRect().top < bottom &&
        contact.getBoundingClientRect().top >= bottom;
      // A tall phone may still show the end of the contact form above the footer.
      const atFooter = footerRect.top < bottom && footerRect.bottom > 0;
      setVisible(beforeContact || atFooter);
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
  }, [number]);

  if (!number) return null;

  return (
    <aside
      ref={bar}
      className="property-mobile-contact"
      aria-label="Contact rapid"
      hidden={!visible}
    >
      <PropertyWhatsAppLink phone={phone} location={location} compact />
      <a className="property-mobile-call" href={`tel:+${number}`}>
        <Phone size={16} aria-hidden="true" />
        Apelează vânzătorul
      </a>
    </aside>
  );
}
