import { Auth } from "@/components/auth";
import { homeMetadata } from "@/lib/seo";
// The same login experience is available at /; consolidate search signals there.
export const metadata = homeMetadata();
export default function Page() {
  return <Auth redirectAuthenticated />;
}
