/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep server code (pg pool, loop engine) out of the client bundle.
  // Next 15 moved this out of `experimental.serverComponentsExternalPackages`.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
