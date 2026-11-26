import type { NextConfig } from "next";
import { PLATFORM_DOMAIN, PLATFORM_ORIGIN } from "./src/lib/platform-brand";
import { platformRedirects } from "./src/lib/platform-redirects";

const photoOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;
const config: NextConfig = {
  images: {
    formats: ["image/webp"],
    qualities: [75, 80],
    deviceSizes: [480, 640, 828, 1080, 1280, 1600, 2000],
    imageSizes: [160, 320],
    minimumCacheTTL: 86400,
    remotePatterns: photoOrigin
      ? [
          {
            protocol: photoOrigin.protocol === "https:" ? "https" : "http",
            hostname: photoOrigin.hostname,
            port: photoOrigin.port,
            pathname: "/storage/v1/object/public/property-images/**",
            search: "",
          },
        ]
      : [],
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  poweredByHeader: false,
  redirects() {
    const oldPages = platformRedirects.map(([source, destination]) => ({
      source,
      destination,
      permanent: true,
    }));
    if (process.env.VERCEL_ENV !== "production") return oldPages;

    const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const aliases = new Set([
      `www.${PLATFORM_DOMAIN}`,
      "mybeautifulproperty.com",
      "www.mybeautifulproperty.com",
      "pucioasa-premium-beige.vercel.app",
    ]);
    if (vercelHost && /^[a-z0-9-]+\.vercel\.app$/.test(vercelHost)) {
      aliases.add(vercelHost);
    }
    return [
      ...Array.from(aliases, (host) => ({
        // Existing payment and worker endpoints need a direct response.
        source: "/:path((?!(?:api|_next|\\.well-known)(?:/|$)).*)",
        destination: `${PLATFORM_ORIGIN}/:path`,
        has: [{ type: "host" as const, value: host.replace(/\./g, "\\.") }],
        permanent: true,
      })),
      ...oldPages,
    ];
  },
  serverExternalPackages: ["@ffmpeg-installer/linux-x64"],
  outputFileTracingIncludes: {
    "/api/admin/*": ["./node_modules/@ffmpeg-installer/linux-x64/**"],
    "/api/video/*": ["./node_modules/@ffmpeg-installer/linux-x64/**"],
    "/api/stripe/webhook": ["./node_modules/@ffmpeg-installer/linux-x64/**"],
    "/api/higgsfield/*": ["./node_modules/@ffmpeg-installer/linux-x64/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};
export default config;
