import { Auth } from "@/components/auth";
import { homeJsonLd, homeMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata = homeMetadata();
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(homeJsonLd()),
        }}
      />
      <Auth redirectAuthenticated />
    </>
  );
}
