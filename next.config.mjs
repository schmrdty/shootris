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
    async headers() {
        // Only the embeddable build may be framed, by the origins listed
        // here or in MINI_FRAME_ANCESTORS; see docs/mini-embed.md.
        const miniHosts = (process.env.MINI_FRAME_ANCESTORS ||
            "'self' https://d3myur.schmidtiest.xyz https://*.schmidtiest.xyz http://localhost:3000 http://localhost:3100");
        return [
            {
                source: '/mini',
                headers: [
                    { key: 'Content-Security-Policy', value: `frame-ancestors ${miniHosts};` },
                ],
            },
        ];
    },
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
