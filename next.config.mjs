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
    // Nothing in the app uses next/image, so the optimizer was only an open
    // endpoint that ran image processing on request, and it has carried its
    // own critical advisory (GHSA-2xp9-vwfh-vxw4). Off. The Ohara host it
    // allowed is a leftover from before the migration.
    images: {
        unoptimized: true,
    },
};

export default nextConfig;
