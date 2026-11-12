import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded at runtime from node_modules: pdfjs needs its own worker file next to it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
