import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Resume import posts the file to a server action (limit enforced again at 5 MB).
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
