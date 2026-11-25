import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(
    "x-property-404-slug",
    request.nextUrl.pathname.split("/").filter(Boolean).at(-1) ?? "",
  );
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/:slug([a-z0-9-]{1,110})", "/p/:slug([a-z0-9-]{1,110})"],
};
