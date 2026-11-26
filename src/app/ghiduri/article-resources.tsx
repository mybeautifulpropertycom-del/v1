import { Download } from "lucide-react";
import { GuideChecklist } from "./guide-checklist";
import { purchaseDocumentChecklist } from "./guide-checklists";
import { handoverTemplate } from "./handover-template";
import { PurchaseBudget } from "./purchase-budget";
import styles from "./guide-tools.module.css";

function PurchaseDocuments() {
  return (
    <GuideChecklist id="acte-cumparare" groups={purchaseDocumentChecklist} />
  );
}

function RentalHandover() {
  return (
    <>
      <p>
        Completează modelul la predare împreună cu cealaltă parte și păstrați
        câte o copie semnată. Poți adăuga spațiu pentru inventar și fotografii.
      </p>
      <ul className={styles.templateSummary}>
        {handoverTemplate.sections.map(({ title }) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
      <a className={styles.button} href={handoverTemplate.filePath} download>
        <Download size={18} aria-hidden="true" /> Descarcă modelul Word
      </a>
    </>
  );
}

export const articleResources: Partial<
  Record<
    string,
    {
      title: string;
      jumpLabel: string;
      Content: () => React.JSX.Element;
    }
  >
> = {
  "acte-cumparare-apartament": {
    title: "Lista de acte și verificări pe etape",
    jumpLabel: "Deschide lista de acte",
    Content: PurchaseDocuments,
  },
  "costuri-cumparare-apartament": {
    title: "Calculator de costuri pentru cumpărarea apartamentului",
    jumpLabel: "Mergi la calculator",
    Content: PurchaseBudget,
  },
  "contract-inchiriere-apartament": {
    title: "Model de proces-verbal pentru predarea apartamentului",
    jumpLabel: "Mergi la modelul de predare",
    Content: RentalHandover,
  },
};
