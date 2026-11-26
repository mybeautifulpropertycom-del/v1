import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { discoveryPath } from "@/lib/property-discovery";
import { publicRobots, siteUrl, SITE_NAME } from "@/lib/seo";
import "@/styles/discovery.css";
import { BuyerCalculator } from "../buyer-calculator";
import { buyerToolPath, buyerTools } from "../buyer-tools";
import styles from "./instrument.module.css";

export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return buyerTools.map(({ slug }) => ({ slug }));
}

async function readTool({ params }: Props) {
  const { slug } = await params;
  const tool = buyerTools.find((item) => item.slug === slug);
  if (!tool) notFound();
  return tool;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const tool = await readTool(props);
  const url = siteUrl(buyerToolPath(tool.slug));
  return {
    title: { absolute: tool.seoTitle },
    description: tool.description,
    alternates: { canonical: url },
    robots: publicRobots(),
    openGraph: {
      type: "website",
      title: tool.seoTitle,
      description: tool.description,
      url,
      locale: "ro_RO",
      siteName: SITE_NAME,
    },
  };
}

export default async function BuyerToolPage(props: Props) {
  const tool = await readTool(props);
  return (
    <div className={`discovery-site ${styles.site}`}>
      <DiscoveryHeader variant="platform" />
      <main className={styles.main}>
        <header className={styles.intro}>
          <h1>{tool.title}</h1>
          <p>{tool.intro}</p>
        </header>
        <div className={styles.layout}>
          <section
            className={styles.calculator}
            aria-labelledby="calculator-title"
          >
            <h2 id="calculator-title">Date pentru calcul</h2>
            <BuyerCalculator slug={tool.slug} />
          </section>
          <aside className={styles.aside} aria-labelledby="metoda">
            <h2 id="metoda">{tool.explanationTitle}</h2>
            <p>{tool.explanation}</p>
            <p>{tool.note}</p>
            <Link
              href={discoveryPath({ transaction: "sale", kind: "apartamente" })}
            >
              Vezi apartamentele de vânzare{" "}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <nav className={styles.related} aria-label="Alte instrumente">
              <h2>Alte instrumente</h2>
              <ul>
                {buyerTools
                  .filter((item) => item.slug !== tool.slug)
                  .map((item) => (
                    <li key={item.slug}>
                      <Link href={buyerToolPath(item.slug)}>{item.title}</Link>
                    </li>
                  ))}
              </ul>
            </nav>
          </aside>
        </div>
      </main>
    </div>
  );
}
