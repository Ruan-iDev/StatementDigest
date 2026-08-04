/** @type {import('next').NextConfig} */
const isDesktopExport = process.env.LEDGERFLOW_DESKTOP === "1";

const nextConfig = {
  reactStrictMode: true,
  // Desktop package needs static files Electron can serve (no Node next-server).
  ...(isDesktopExport
    ? {
        output: "export",
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
