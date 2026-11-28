import { Auth } from "@/components/auth";
import { SITE_NAME, socialMetadata } from "@/lib/seo";

const title = "Creează-ți contul";
const description =
  "Creează un cont și publică gratuit anunțuri imobiliare cu fotografii.";

export const metadata = {
  title,
  description,
  robots: { index: false },
  ...socialMetadata(`${title} | ${SITE_NAME}`, description, "/inregistrare"),
};

export default function Page() {
  return <Auth initialMode="signup" />;
}
