import type { Metadata } from "next";
import { DashboardChat } from "@/components/dashboard-chat";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/nunito-sans";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import "@/styles/atelier.css";
import "@/styles/footer.css";
import "@/styles/admin.css";
import "@/styles/publication-packages.css";
import "@/styles/property-print.css";
import "@/styles/neighbourhood.css";
import "@/styles/workspace-typography.css";
import "@/styles/agent-guide.css";
import { htmlLanguage } from "@/i18n/config";
import { HOME_TITLE, HOME_DESCRIPTION, siteOrigin } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: HOME_TITLE,
    template: "%s | Următoarea Proprietate",
  },
  description: HOME_DESCRIPTION,
  // Give search crawlers a stable URL for the platform favicon.
  icons: {
    icon: { url: "/icon.png", type: "image/png", sizes: "96x96" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={htmlLanguage}>
      <body>
        {children}
        <DashboardChat />
      </body>
    </html>
  );
}
