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
            // Adaptive-soundtrack stems live under a directory named after the
            // hash of their own bytes (see scripts/audio/render/render.py), so a
            // given URL can never serve different audio. That is what makes
            // `immutable` safe here: a returning player revalidates nothing, and
            // a re-render reaches them at once under a new path rather than
            // waiting out a max-age. Files in public/ otherwise get
            // `max-age=0` from Next, which costs a round trip per stem per load.
            {
                source: '/music/:pack/:bpm/:rev/:file*',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
                ],
            },
            // meta.json is the index that points at those hashed directories, so
            // it is the one file that must never be pinned — it is how a client
            // learns a new revision exists. This matches Next's current default
            // for public/, but the default has changed between versions and the
            // whole scheme breaks silently if it changes again.
            {
                source: '/music/:pack/meta.json',
                headers: [
                    { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
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
