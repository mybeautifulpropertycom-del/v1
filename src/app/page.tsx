import Image from "next/image";
import { DiscoveryHeader } from "@/components/discovery-header";
import { DiscoveryQuiz } from "@/components/discovery-quiz";
import {
  HOME_IMAGE,
  homeJsonLd,
  homeMetadata,
  serializeJsonLd,
} from "@/lib/seo";
import "@/styles/discovery.css";
import "@/styles/discovery-editorial.css";

export const metadata = homeMetadata();

export default function Home() {
  return (
    <div className="discovery-site discovery-editorial-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(homeJsonLd()) }}
      />
      <div className="discovery-editorial-scene" aria-hidden="true">
        <Image src={HOME_IMAGE} alt="" fill sizes="100vw" preload />
      </div>
      <DiscoveryHeader variant="platform" />
      <main className="discovery-editorial-main">
        <div className="discovery-editorial-intro">
          <h1>
            Găsește Locul Pe Care <span>Îl Vei Numi Acasă</span>
          </h1>
          <p>
            O modalitate mai simplă și mai personală de a descoperi următoarea
            ta locuință.
          </p>
        </div>
        <DiscoveryQuiz editorial />
      </main>
    </div>
  );
}
