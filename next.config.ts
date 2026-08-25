import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Anchor Turbopack to this app (a package-lock.json exists in a parent
  // directory and would otherwise be picked up as the workspace root).
  turbopack: { root: __dirname },
};

export default withNextIntl(nextConfig);
