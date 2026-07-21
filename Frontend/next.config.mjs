/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle so the production image ships only the
  // files it needs to run (see Frontend/Dockerfile), not the whole node_modules.
  output: "standalone",
};
export default nextConfig;
