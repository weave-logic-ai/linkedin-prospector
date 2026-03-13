import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ruvector"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
