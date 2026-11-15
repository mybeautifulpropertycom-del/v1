import { Auth } from "@/components/auth";
export const metadata = {
  title: "Resetează parola",
  robots: { index: false },
};
export default function Page() {
  return <Auth resetPassword />;
}
