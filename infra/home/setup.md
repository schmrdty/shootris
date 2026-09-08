# Home server setup

The home server runs every game container. It is never exposed to the
internet — only the VPS reaches it, over Tailscale. Secrets stay here.

## 1. Prerequisites

- Docker + Docker Compose (Docker Desktop on Windows, or `apt install docker.io docker-compose-v2` on Linux)
- Tailscale, logged into the same tailnet as the VPS:

  ```bash
  curl -fsSL https://tailscale.com/install.sh | sh
  sudo tailscale up
  tailscale ip -4   # note this IP — the VPS Caddyfile and .env below use it
  ```

## 2. Get the code (NOT inside OneDrive)

Clone to a plain local path — OneDrive sync fights Docker and git:

```bash
git clone https://github.com/schmrdty/shootris.git ~/apps/shootris
cd ~/apps/shootris
```

## 3. Configure

1. Copy `.env.local.example` to `.env.local` in the repo root and fill in
   the real values (MYU address, payout address, OnchainKit key,
   `SPACETIMEDB_ADMIN_TOKEN`, `NEXT_PUBLIC_HOST=shootris.schmidtiest.xyz`).
2. Create `infra/home/.env`:

   ```
   TAILNET_IP=100.x.y.z
   ```

## 4. Run

```bash
cd infra/home
docker compose up -d --build
```

Verify locally: `curl -I http://localhost:3000` (from the home server) or
`curl -I http://100.x.y.z:3000` (from the VPS) returns 200.

## Updating

```bash
git pull && docker compose up -d --build
```

Rebuild (not just restart) whenever any `NEXT_PUBLIC_*` value changes —
those are baked into the bundle at build time.
