import { Auth } from "@/components/auth";
import { SITE_NAME, socialMetadata } from "@/lib/seo";

const title = "Autentificare";
const description =
  "Intră în cont pentru a publica și administra anunțurile tale imobiliare.";

export const metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  ...socialMetadata(`${title} | ${SITE_NAME}`, description, "/autentificare"),
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ actiune?: string | string[] }>;
}) {
  const { actiune } = await searchParams;
  return <Auth redirectAuthenticated publishListing={actiune === "publica"} />;
}
