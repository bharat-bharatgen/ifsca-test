/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    proxyClientMaxBodySize: 500 * 1024 * 1024, // 500 MB limit
  },
  // Externalize canvas for server-side rendering
  serverExternalPackages: ['canvas'],
  // Empty turbopack config to acknowledge webpack config with Turbopack
  turbopack: {},
  webpack: (config, { isServer }) => {
    // Avoid bundling native 'canvas' on both server and client
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
    };
    
    // Handle canvas as external for server builds
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        canvas: 'commonjs canvas',
      });
    }

    // Fallback for node modules not available in browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };

    return config;
  },
};

export default nextConfig;
