import { Auth } from "@/components/auth";
export const metadata = {
  title: "Autentificare",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ actiune?: string | string[] }>;
}) {
  const { actiune } = await searchParams;
  return <Auth redirectAuthenticated publishListing={actiune === "publica"} />;
}
