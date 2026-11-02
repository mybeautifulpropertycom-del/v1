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
    default: "My Beautiful Property - Sell Your Property 10x Faster",
    template: "%s | My Beautiful Property",
  },
  description:
    "Sell your property 10x faster using My Beautiful Property app. Add your details, property information and the images. Our app make the rest.",
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
