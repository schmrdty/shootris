/** @type {import('next').NextConfig} */
const nextConfig = {
    // Self-contained server bundle for Docker/VPS hosting (set in the Dockerfile;
    // requires symlink support, which Windows local builds lack)
    output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
    typescript: {
        ignoreBuildErrors: true,
    },
    // spacetimedb's dev export points at raw .ts sources; transpile it
    transpilePackages: ['spacetimedb'],
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'ohara-assets.s3.us-east-2.amazonaws.com',
            },
        ],
    },
};

export default nextConfig;
