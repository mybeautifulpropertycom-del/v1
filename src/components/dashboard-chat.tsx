"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";

export function DashboardChat() {
  const pathname = usePathname();
  const inDashboard = pathname === "/panou" || pathname.startsWith("/panou/");
  const requested = useRef(false);

  useLayoutEffect(() => {
    if (inDashboard) {
      requested.current = true;
    } else if (requested.current) {
      // Unmounting next/script cannot undo an SDK's globals, event listeners or
      // pending async work. Start a clean document when leaving the dashboard,
      // including browser Back and client-side redirects, so Jivo cannot keep
      // running on property sites, previews, sample designs or authentication.
      requested.current = false;
      window.location.reload();
    }
  }, [inDashboard]);

  if (!inDashboard) return null;
  return (
    <Script
      id="jivo-dashboard-chat"
      src="https://code.jivosite.com/widget/Bd02huXcxy"
      strategy="afterInteractive"
      async
    />
  );
}
