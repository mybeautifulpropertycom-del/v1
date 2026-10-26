import type { NextConfig } from "next";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["@ffmpeg-installer/linux-x64"],
  outputFileTracingIncludes: {
    "/api/video/*": ["./node_modules/@ffmpeg-installer/linux-x64/**"],
    "/api/stripe/webhook": ["./node_modules/@ffmpeg-installer/linux-x64/**"],
    "/api/higgsfield/webhook": [
      "./node_modules/@ffmpeg-installer/linux-x64/**",
    ],
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
