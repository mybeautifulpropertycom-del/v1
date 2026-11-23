import { Auth } from "@/components/auth";
export const metadata = {
  title: "Autentificare",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <Auth redirectAuthenticated />;
}
