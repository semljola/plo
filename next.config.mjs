/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep server code (pg pool, loop engine) out of the client bundle.
    serverComponentsExternalPackages: ["pg"],
  },
};

export default nextConfig;
