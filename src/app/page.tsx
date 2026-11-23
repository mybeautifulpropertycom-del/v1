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
      <DiscoveryHeader editorial />
      <main className="discovery-editorial-main">
        <div className="discovery-editorial-intro">
          <h1>
            Următoarea <em>Proprietate</em>
          </h1>
          <p>
            Descoperă proprietatea care ți se potrivește, prin câteva întrebări
            simple.
          </p>
        </div>
        <DiscoveryQuiz editorial />
      </main>
    </div>
  );
}
