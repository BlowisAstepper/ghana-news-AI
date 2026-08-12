import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up looking for a workspace root and can
  // land on an unrelated lockfile elsewhere on disk (e.g. ~/package-lock.json),
  // which produces the "inferred your workspace root" warning at build time.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
