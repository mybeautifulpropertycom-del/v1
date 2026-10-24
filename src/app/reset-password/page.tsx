import { Auth } from "@/components/auth";
export const metadata = {
  title: "Reset your password",
  robots: { index: false },
};
export default function Page() {
  return <Auth resetPassword />;
}
