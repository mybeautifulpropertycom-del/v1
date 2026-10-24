import Link from "next/link";
import { ArrowLeft } from "lucide-react";
export default function NotFound() {
  return (
    <div className="state-screen">
      <span className="eyebrow">A DIFFERENT DIRECTION</span>
      <h1>This door isn’t open.</h1>
      <p>This page may be unpublished, or the link may have changed.</p>
      <Link href="/" className="button primary">
        <ArrowLeft size={16} />
        Back to My Beautiful Property
      </Link>
    </div>
  );
}
