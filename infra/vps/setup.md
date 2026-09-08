# VPS front-door setup

The VPS is a dumb, disposable front door: Caddy for TLS + reverse proxy,
Tailscale for the private path home. No app code, no secrets, no data.
Any ~$4–6/mo box (1 vCPU / 1 GB, e.g. Hetzner CX22, Racknerd, DigitalOcean)
is plenty. Instructions assume Ubuntu/Debian.

## 1. Base hardening

```bash
sudo apt update && sudo apt -y upgrade
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow OpenSSH
sudo ufw enable
```

## 2. Tailscale (private tunnel to home)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Log in with the same Tailscale account as the home server. Then note the
home server's tailnet IP (run on the home server):

```bash
tailscale ip -4
```

## 3. Caddy

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Copy [Caddyfile](Caddyfile) to `/etc/caddy/Caddyfile`, replace
`HOME_TAILNET_IP` with the home server's tailnet IP, then:

```bash
sudo systemctl reload caddy
```

Caddy fetches and renews certificates automatically once DNS points here.

## 4. DNS

At the schmidtiest.xyz registrar, add an A record:
`shootris` → this VPS's public IPv4.

## Notes

- $0 alternative: Cloudflare Tunnel (`cloudflared`) on the home server can
  replace this VPS entirely, at the cost of a Cloudflare dependency.
- No-third-party tunnel alternative: plain WireGuard between VPS and home
  (Tailscale is WireGuard with the key management done for you).
- The VPS can be rebuilt from this doc in ~10 minutes; nothing on it is
  precious.
