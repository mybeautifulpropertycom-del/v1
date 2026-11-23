import Image from "next/image";
import { DiscoveryHeader } from "@/components/discovery-header";
import { DiscoveryQuiz } from "@/components/discovery-quiz";
import { homeJsonLd, homeMetadata, serializeJsonLd } from "@/lib/seo";
import "@/styles/discovery.css";

export const metadata = homeMetadata();

export default function Home() {
  return (
    <div className="discovery-site">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeJsonLd()) }}
      />
      <DiscoveryHeader />
      <main className="discovery-shell">
        <section className="discovery-hero">
          <div className="discovery-cover">
            <Image
              src="/images/template-property/01-exterior.webp"
              alt=""
              fill
              sizes="(max-width: 800px) 100vw, 56vw"
              preload
            />
            <div className="discovery-cover-copy">
              <h1>
                Unde vrei să <em>locuiești?</em>
              </h1>
              <p>
                Alege ce contează pentru tine și vezi proprietățile care se
                încadrează.
              </p>
            </div>
          </div>
          <DiscoveryQuiz />
        </section>
      </main>
    </div>
  );
}
