This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## $MYU Configuration

The single-player continue feature is paid in **$MYU** (ERC-20 on Base). Players without $MYU can swap ETH/USDC/WETH/cbBTC/DAI for $MYU in-app via the OnchainKit Swap widget (requires the token to have on-chain liquidity on Base that Coinbase's swap aggregator can route).

Set in `.env.local` (see `.env.local.example`):

- `NEXT_PUBLIC_MYU_TOKEN_ADDRESS` — the $MYU contract address on Base (**required**; the pay/swap UI is disabled until set)
- `NEXT_PUBLIC_MYU_DECIMALS` — token decimals (default 18)
- `NEXT_PUBLIC_CONTINUE_PRICE_MYU` — whole-token price of one continue (default 100)
- `NEXT_PUBLIC_PAYOUT_SPLIT_ADDRESS` — where continue payments are sent

- `NEXT_PUBLIC_PVP_ENTRY_FEE_MYU` — whole-token PvP entry fee per match/queue entry; `0` (default) disables it. Matchmaking and the in-match PvP screen are both implemented, so this can be turned on whenever you want PvP to cost MYU.

- `NEXT_PUBLIC_COLLECTION_CHAIN` / `NEXT_PUBLIC_COLLECTION_CONTRACT` — the vibe.market card collection that unlocks piece skins (see [design/nft-asset-spec.md](design/nft-asset-spec.md)). Set `COLLECTION_FROM_BLOCK` to the deploy block so ownership scans stay fast.
- `NEXT_PUBLIC_MILESTONE_NFT_URL` — mint page linked from the Journey stage-clear reward. Unset hides the button.

Deployment target: `shootris.schmidtiest.xyz`. After deploying, re-sign the Farcaster `accountAssociation` in `public/.well-known/farcaster.json` for the new domain (the old signature is bound to the Ohara domain).

## Deploying

The frontend is the only thing you host — the game backend is the SpacetimeDB module on Maincloud, and payments/swaps run on Base.

Production runs on the **VPS-front-door + home-server** pattern shared by all D3MYUR games: a small VPS passes :80/:443 straight through a private Tailscale tunnel to the home server, where Traefik terminates TLS and routes each game by hostname from its Docker labels. Full setup and the add-a-game checklist live in [infra/README.md](infra/README.md).

(Fallback: the repo also deploys cleanly to Vercel — import, set the `.env.local` vars, add the domain.)

HTTPS is required for Farcaster mini-app embedding; Traefik issues and renews certificates automatically once the `shootris.schmidtiest.xyz` A record points at the VPS.
 
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
