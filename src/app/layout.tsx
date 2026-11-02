import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import "@/styles/atelier.css";
import "@/styles/footer.css";
import "@/styles/admin.css";
import { htmlLanguage } from "@/i18n/config";
import { HOME_TITLE, HOME_DESCRIPTION, siteOrigin } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: HOME_TITLE,
    template: "%s | My Beautiful Property",
  },
  description: HOME_DESCRIPTION,
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
