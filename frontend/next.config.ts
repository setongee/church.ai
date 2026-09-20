import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fabric.js wraps the <canvas> DOM node with its own lower/upper canvas structure outside
  // React's knowledge. Strict Mode's deliberate dev-only mount->cleanup->mount cycle (meant to
  // surface effect bugs) fights that: Fabric's disposal/re-init on the same node during that
  // double-invoke corrupts its internal canvas context. This only affects development, not
  // production builds, and is a known rough edge in the Fabric+React integration.
  reactStrictMode: false,
};

export default nextConfig;
