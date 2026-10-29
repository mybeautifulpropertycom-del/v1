import { Auth } from "@/components/auth";

export const metadata = {
  title: "Create your account",
  robots: { index: false },
};

export default function Page() {
  return <Auth initialMode="signup" />;
}
