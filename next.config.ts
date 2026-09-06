import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // 検索結果のサムネイルは各ECのCDNから来る。最適化は Cloudflare 側で行わない。
    unoptimized: true,
  },
};

export default nextConfig;
