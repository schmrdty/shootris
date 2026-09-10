# D3MYUR games hosting

One cheap VPS is the public front door for every game. All game containers
run on the **home server**, where Traefik terminates TLS and routes by
hostname. Game state lives in SpacetimeDB Maincloud. The home IP is never
exposed and secrets never leave the house.

```
Internet → DNS (game.schmidtiest.xyz → VPS IP)
        → VPS: nginx TCP passthrough of :80/:443   [infra/vps/]
        → Tailscale tunnel (private)
        → Home: Traefik → game containers          [infra/home/]
        → SpacetimeDB Maincloud + chain RPCs (outbound only)
```

**Why passthrough instead of proxying at the VPS:** TLS and routing live
with the containers, so Traefik discovers each game from its Docker labels.
Adding a game means editing one compose file at home — the VPS is never
touched again.

Setup order: [vps/setup.md](vps/setup.md) → [home/setup.md](home/setup.md).

## Adding the next game

1. **Home:** add a service to [home/docker-compose.yml](home/docker-compose.yml)
   with the four `traefik.*` labels (template at the bottom of that file),
   then `docker compose up -d`.
2. **DNS:** add an A record `<game>.schmidtiest.xyz` → the VPS IP.
3. That's it. Traefik requests the certificate on first request.

Marginal cost and marginal VPS config per extra game: zero.
