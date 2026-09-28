import type { NextConfig } from "next";

const chromiumBinTrace = ["./node_modules/@sparticuz/chromium/bin/**"];

const nextConfig: NextConfig = {
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "pdf-parse", "mammoth"],
  // NFT does not follow dynamically loaded .br packs. Without this, Vercel
  // functions throw: The input directory ".../@sparticuz/chromium/bin" does not exist.
  outputFileTracingIncludes: {
    // Use * not [bookingId]: picomatch treats brackets as a character class.
    "/api/invoice/*/pdf": chromiumBinTrace,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ppdaubmxrmzgmxdnyxff.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;