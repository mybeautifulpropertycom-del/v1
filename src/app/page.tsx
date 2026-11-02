import { Auth } from "@/components/auth";
import { homeMetadata, serializeJsonLd, siteUrl, SITE_NAME } from "@/lib/seo";

export const metadata = homeMetadata();
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            url: siteUrl("/"),
            inLanguage: "en-US",
          }),
        }}
      />
      <Auth redirectAuthenticated />
    </>
  );
}
