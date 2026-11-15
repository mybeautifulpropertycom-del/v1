import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound() {
  return (
    <div className="state-screen">
      <span className="eyebrow">O ALTĂ DIRECȚIE</span>
      <h1>Această pagină nu este disponibilă.</h1>
      <p>Pagina poate fi nepublicată sau linkul s-a schimbat.</p>
      <Link href="/" className="button primary">
        <ArrowLeft size={16} />
        Înapoi la Următoarea Proprietate
      </Link>
    </div>
  );
}
