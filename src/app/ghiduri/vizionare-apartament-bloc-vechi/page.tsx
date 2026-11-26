import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiscoveryHeader } from "@/components/discovery-header";
import { discoveryPath } from "@/lib/property-discovery";
import { publicRobots, siteUrl } from "@/lib/seo";
import "@/styles/discovery.css";
import { GuideChecklist } from "../guide-checklist";
import { apartmentViewingChecklist } from "../guide-checklists";
import { GuideLinks } from "../guide-links";
import toolStyles from "../guide-tools.module.css";
import { viewingGuide } from "./guide";
import styles from "./guide.module.css";

export const metadata: Metadata = {
  title: { absolute: viewingGuide.title },
  description: viewingGuide.description,
  alternates: { canonical: siteUrl(viewingGuide.path) },
  robots: publicRobots(),
};

export default function ApartmentViewingGuide() {
  const [building, apartment, costs, documents] = viewingGuide.sections;
  return (
    <div className={`discovery-site ${styles.site}`}>
      <DiscoveryHeader variant="platform" />
      <main className={styles.content}>
        <article>
          <header className={styles.intro}>
            <h1>{viewingGuide.title}</h1>
            <p>
              Dacă după vizionare îți amintești mai ales cum intra lumina în
              living, e ușor să uiți ce voiai să întrebi. Îți propunem să faci
              vizita în ordinea în care ai ajunge acasă într-o zi obișnuită.
              Începe cu drumul până la bloc, apoi ia la rând spațiile prin care
              ai trece zilnic. Lasă câteva minute la final pentru cheltuieli și
              acte.
            </p>
            <a className={toolStyles.jump} href="#checklist">
              Deschide lista de vizionare
            </a>
          </header>
          <nav className={styles.contents} aria-label="Cuprinsul ghidului">
            <h2>În acest ghid</h2>
            <ol>
              {viewingGuide.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <section id={building.id} className={styles.section}>
            <h2>{building.title}</h2>
            <p>
              Încearcă să ajungi cu zece minute mai devreme. Mergi pe jos de la
              stația pe care ai folosi-o și vezi cât de ușor intri în bloc.
              Uită-te la casa scării, la lift și la felul în care sunt
              întreținute spațiile comune. Întreabă dacă au fost înlocuite
              coloanele de apă și dacă sunt programate lucrări la lift, la
              acoperiș sau la fațadă.
            </p>
            <p>
              Pentru riscul seismic, cere documentele de expertiză ale clădirii,
              dacă există, și verifică adresa în evidențele publice locale. Dacă
              ai nelămuriri despre starea blocului, discută cu un inginer
              structurist înainte să iei o decizie.
            </p>
          </section>
          <section id={apartment.id} className={styles.section}>
            <h2>{apartment.title}</h2>
            <p>
              Deschide geamurile și ascultă câteva momente cum se aude strada.
              Apoi închide-le. Diferența te ajută să îți imaginezi cum ar fi să
              lucrezi sau să dormi acolo. Uită-te în colțuri și în jurul
              ferestrelor. Dacă vezi urme de umezeală sau de reparații, întreabă
              ce s-a întâmplat și când a fost rezolvată problema.
            </p>
            <p>
              Cu acordul proprietarului, verifică presiunea apei și cât durează
              până vine apa caldă. Întreabă când a fost schimbată instalația
              electrică. Dacă vrei un dormitor pentru copil sau un birou, vino
              cu dimensiunile patului ori mesei și măsoară locul. Verifică și
              traseul dintre hol, living și camere, mai ales dacă vrei să le
              folosești în același timp în moduri diferite.
            </p>
          </section>
          <section id={costs.id} className={styles.section}>
            <h2>{costs.title}</h2>
            <p>
              Cere o factură de iarnă și una dintr-o lună mai caldă, dacă
              proprietarul le are. Întreabă câte persoane locuiau atunci acolo
              și ce include întreținerea. Adaugă la buget lucrările pe care ai
              vrea să le faci înainte de mutare și întreabă ce reparații ale
              blocului sunt deja discutate de asociație.
            </p>
          </section>
          <section id={documents.id} className={styles.section}>
            <h2>{documents.title}</h2>
            <p>
              Compară planul din documentația cadastrală cu ce ai văzut în
              apartament. Uită-te la pereți, balcon și la locurile unde par să
              se fi făcut modificări. Întreabă ce acte există pentru aceste
              lucrări. Înainte de o promisiune sau de plata unui avans, cere
              notarului să verifice actele proprietății și situația din cartea
              funciară.
            </p>
          </section>
          <section
            className={toolStyles.tool}
            id="checklist"
            aria-labelledby="checklist-title"
          >
            <h2 id="checklist-title">Lista de verificare pentru vizionare</h2>
            <GuideChecklist
              id="vizionare-bloc-vechi"
              groups={apartmentViewingChecklist}
            />
          </section>
          <aside className={styles.next} aria-labelledby="alege">
            <h2 id="alege">Alege apartamentele pe care vrei să le vizitezi</h2>
            <p>
              Când ai câteva opțiuni, păstrează aceeași listă de întrebări
              pentru fiecare. O să fie mai ușor să le compari după vizionări.
            </p>
            <Link
              href={discoveryPath({ transaction: "sale", kind: "apartamente" })}
            >
              Vezi apartamentele de vânzare{" "}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </aside>
        </article>
        <GuideLinks currentPath={viewingGuide.path} />
      </main>
    </div>
  );
}
