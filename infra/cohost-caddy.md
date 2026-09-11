# Co-hosting Shootris behind an existing Caddy

Use this when the target server **already runs Caddy** (as keen-fish does,
serving wally./admin.). Caddy already owns :80 and :443, so Traefik cannot
also bind them — the game container listens on localhost only and Caddy
reverse-proxies to it. Nothing already on the box is disturbed.

## 1. See what Caddy serves today (before changing anything)

```bash
cat /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
```

## 2. Run the game container, bound to localhost

```bash
cd ~/apps/shootris/infra
docker compose -f docker-compose.cohost.yml up -d --build
curl -I http://127.0.0.1:3000     # expect 200
```

It publishes to `127.0.0.1:3000` only — not reachable from the internet
except through Caddy.

## 3. Add one block to the Caddyfile

```caddyfile
shootris.schmidtiest.xyz {
	reverse_proxy 127.0.0.1:3000
	encode gzip
}
```

Then:

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Caddy fetches the certificate automatically once DNS points here.

## 4. DNS

Add an A record `shootris` → the server's public IPv4 (or point it at one of
the floating IPs already attached to the box).

## Adding the next game

Give it the next free port (3001, 3002, …) in its own compose file, add a
matching Caddyfile block, add a DNS record, reload Caddy. Same four steps
each time.

## Before putting the game here

This server needs `SPACETIMEDB_ATTESTOR_TOKEN` in `.env.local`. Use the
least-privilege attestor identity, never the owner token — see
[spacetimedb-attestor.md](spacetimedb-attestor.md). That way a compromise of
this box costs you forged wallet bindings, not the database.
