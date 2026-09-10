# Home server setup

Runs Traefik plus every game container. Never exposed to the internet —
only the VPS reaches it, over Tailscale. Secrets stay here.

## 1. Prerequisites

```bash
curl -fsSL https://get.docker.com | sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4    # give this IP to the VPS: sudo link-home <ip>
```

## 2. Get the code (NOT inside OneDrive)

OneDrive sync corrupts git and Docker state — use a plain local path:

```bash
git clone https://github.com/schmrdty/shootris.git ~/apps/shootris
cd ~/apps/shootris
```

## 3. Configure

1. Repo root `.env.local` — copy from `.env.local.example` and fill in the
   real values (MYU address, payout address, OnchainKit key,
   `SPACETIMEDB_ADMIN_TOKEN`, `NEXT_PUBLIC_HOST=shootris.schmidtiest.xyz`,
   and the collection/chain vars). This file is gitignored, so it must be
   created on this machine.
2. `infra/home/.env` — copy from `.env.example`:

   ```
   ACME_EMAIL=you@example.com
   SHOOTRIS_HOST=shootris.schmidtiest.xyz
   ```

## 4. Run

```bash
cd infra/home
docker compose up -d --build
```

Check locally with `curl -I -H 'Host: shootris.schmidtiest.xyz' http://localhost`
(expect a 308 redirect to https). Once DNS points at the VPS and
`link-home` has run, Traefik issues the certificate on the first real
request.

## Updating

```bash
git pull && docker compose up -d --build
```

Rebuild (not just restart) whenever a `NEXT_PUBLIC_*` value changes — those
are baked into the bundle at build time.
