import { Auth } from "@/components/auth";

export const metadata = {
  title: "Creează-ți contul",
  robots: { index: false },
};

export default function Page() {
  return <Auth initialMode="signup" />;
}
