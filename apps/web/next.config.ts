import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` only serves dev assets to localhost by default; allow 127.0.0.1 too.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Enables forbidden(): unauthorized section access renders a real 403.
    authInterrupts: true,
  },
};

export default nextConfig;
