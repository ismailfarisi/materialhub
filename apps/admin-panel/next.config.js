import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosted on the prod frontend EC2 (deploy/frontend/next-app.Dockerfile).
  // Tracing root is the monorepo root so workspace deps (@materialhub/ui) land
  // in .next/standalone. `next build` always runs from this app directory.
  output: "standalone",
  experimental: {
    outputFileTracingRoot: path.join(process.cwd(), "../.."),
  },
  images: {
    remotePatterns: [
      // Local S3 + Cloudflare Stream stand-ins (backend docker-compose); dev only.
      ...(process.env.NODE_ENV === "development"
        ? [
            { protocol: "http", hostname: "localhost", port: "7070" },
            { protocol: "http", hostname: "localhost", port: "7071" },
          ]
        : []),
      {
        protocol: "https",
        hostname: "cdn.materialhubuae.com",
      },
      {
        protocol: "https",
        hostname: "*.cloudfront.net",
      },
      {
        protocol: "https",
        hostname: "*.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "*.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
