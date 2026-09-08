# D3MYUR games hosting pattern

One cheap VPS is the public front door for every game; the home server
runs all the containers; game state lives in SpacetimeDB Maincloud.
The home IP is never exposed and secrets never leave the home server.

```
Internet → DNS (game.schmidtiest.xyz → VPS IP)
        → VPS: Caddy (auto-HTTPS)          [infra/vps/]
        → Tailscale tunnel (private)
        → Home server: Docker containers    [infra/home/]
        → SpacetimeDB Maincloud + Base RPC (outbound only)
```

- First-time setup: [vps/setup.md](vps/setup.md), then [home/setup.md](home/setup.md).

## Adding the next game (4 steps, ~5 minutes)

1. **Home server**: run the new game's container on the next free port
   (3001, 3002, …) — its own compose file in its own repo, same pattern as
   [home/docker-compose.yml](home/docker-compose.yml).
2. **DNS**: add an A record `<game>.schmidtiest.xyz` → the VPS IP.
3. **VPS**: add a block to `/etc/caddy/Caddyfile` (template at the bottom
   of [vps/Caddyfile](vps/Caddyfile)), then `sudo systemctl reload caddy`.
4. If it's a Farcaster mini-app: sign its `accountAssociation` for the new
   domain.

Marginal cost per additional game: $0.
