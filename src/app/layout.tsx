import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import "@/styles/atelier.css";
import "@/styles/footer.css";
import "@/styles/admin.css";
import { htmlLanguage } from "@/i18n/config";

export const metadata: Metadata = {
  title: {
    default: "My Beautiful Property — A beautiful first impression",
    template: "%s | My Beautiful Property",
  },
  description:
    "Beautiful property websites, your personal brand, and every listing in one thoughtfully designed workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={htmlLanguage}>
      <body>{children}</body>
    </html>
  );
}
