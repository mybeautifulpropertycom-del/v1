import { Auth } from "@/components/auth";
export const metadata = { title: "Welcome home", robots: { index: false } };
export default function Page() {
  return <Auth />;
}
