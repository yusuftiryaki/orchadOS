import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` only serves dev assets to localhost by default; allow 127.0.0.1 too.
  allowedDevOrigins: ["127.0.0.1"],
  // PDF reports read their fonts from disk (src/lib/pdf/theme.ts).
  outputFileTracingIncludes: {
    "/portal/parsel/[parcelId]/**": ["./src/lib/pdf/fonts/*.ttf"],
    "/makbuz/[paymentId]": ["./src/lib/pdf/fonts/*.ttf"],
  },
  // Server-only; keeps its font and layout engines out of the bundler.
  serverExternalPackages: ["@react-pdf/renderer"],
  experimental: {
    // Enables forbidden(): unauthorized section access renders a real 403.
    authInterrupts: true,
  },
};

export default nextConfig;
