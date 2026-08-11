import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT_MODE === "standalone" ? "standalone" : undefined,
};

export default nextConfig;

initOpenNextCloudflareForDev();
