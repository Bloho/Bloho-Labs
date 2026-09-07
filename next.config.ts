import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { '/*': ['./content/**/*.json', './public/**/*.{png,jpg,jpeg,webp,avif,gif}'] },
};

export default nextConfig;
