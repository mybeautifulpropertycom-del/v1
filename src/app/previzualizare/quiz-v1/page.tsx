import type { Metadata } from "next";
import Image from "next/image";
import { DiscoveryHeader } from "@/components/discovery-header";
import { DiscoveryQuiz } from "@/components/discovery-quiz";
import "@/styles/discovery.css";

export const metadata: Metadata = {
  title: "Următoarea Proprietate · Varianta 1",
  robots: { index: false, follow: false },
};

export default function DiscoveryCardPreview() {
  return (
    <div className="discovery-site discovery-home">
      <div className="discovery-home-scene" aria-hidden="true">
        <div className="discovery-home-photo">
          <Image
            src="/images/template-property/01-exterior.webp"
            alt=""
            fill
            sizes="(max-width: 800px) 100vw, 75vw"
            preload
          />
        </div>
      </div>
      <DiscoveryHeader />
      <main className="discovery-shell discovery-hero">
        <div className="discovery-cover-copy">
          <h1>
            Unde vrei să <em>locuiești?</em>
          </h1>
          <p>
            Alege ce contează pentru tine și vezi proprietățile care se
            încadrează.
          </p>
        </div>
        <DiscoveryQuiz />
      </main>
    </div>
  );
}
