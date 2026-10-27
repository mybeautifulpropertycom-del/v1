import type { NextConfig } from "next";

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
