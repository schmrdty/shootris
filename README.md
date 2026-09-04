This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## $MYU Configuration

The single-player continue feature is paid in **$MYU** (ERC-20 on Base). Players without $MYU can swap ETH/USDC/WETH/cbBTC/DAI for $MYU in-app via the OnchainKit Swap widget (requires the token to have on-chain liquidity on Base that Coinbase's swap aggregator can route).

Set in `.env.local` (see `.env.local.example`):

- `NEXT_PUBLIC_MYU_TOKEN_ADDRESS` — the $MYU contract address on Base (**required**; the pay/swap UI is disabled until set)
- `NEXT_PUBLIC_MYU_DECIMALS` — token decimals (default 18)
- `NEXT_PUBLIC_CONTINUE_PRICE_MYU` — whole-token price of one continue (default 100)
- `NEXT_PUBLIC_PAYOUT_SPLIT_ADDRESS` — where continue payments are sent

- `NEXT_PUBLIC_PVP_ENTRY_FEE_MYU` — whole-token PvP entry fee per match/queue entry; `0` (default) disables it. Note: PvP matchmaking works, but the in-match PvP gameplay screen was never implemented by Ohara — keep this at 0 until it is.

Deployment target: `shootris.schmidtiest.xyz`. After deploying, re-sign the Farcaster `accountAssociation` in `public/.well-known/farcaster.json` for the new domain (the old signature is bound to the Ohara domain).

## Deploying

The frontend is the only thing you host — the game backend is the SpacetimeDB module on Maincloud, and payments/swaps run on Base.

### Option A: Any VPS with Docker (no Vercel dependency)

```bash
docker compose up -d --build
```

Serves on port 3000. Put a reverse proxy with TLS in front (Caddy is the easiest: `caddy reverse-proxy --from shootris.schmidtiest.xyz --to localhost:3000` gets automatic HTTPS). `NEXT_PUBLIC_*` values are baked in at build time from `.env.local`, so rebuild the image after changing them.

### Option B: Vercel

Import the repo at vercel.com/new (or `npx vercel`), add the `.env.local` variables in Project Settings → Environment Variables, then add `shootris.schmidtiest.xyz` under Project Settings → Domains.

### DNS (either option)

At your `schmidtiest.xyz` DNS provider, add a record for the `shootris` subdomain:

- **VPS**: an `A` record pointing to the server's IP
- **Vercel**: a `CNAME` record pointing to `cname.vercel-dns.com`

HTTPS is required for Farcaster mini-app embedding (Caddy or Vercel both handle certificates automatically).
 
## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
