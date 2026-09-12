# VPS front-door setup

A disposable box that forwards :80 and :443 to the home server over
Tailscale. No app code, no certificates, no secrets. Any ~€3/mo instance
(1 vCPU / 1 GB) is plenty — it only shuffles packets.

> **Two user-data files, pick one:**
> [cloud-init-cohost.yaml](cloud-init-cohost.yaml) — the box hosts the game
> containers itself and Caddy issues the certificates. No nginx, no tunnel.
> This is the one for keen-fish.
> [cloud-init.yaml](cloud-init.yaml) — the passthrough front-door pattern
> below, where TLS terminates elsewhere.

## 1. Deploy

Paste [cloud-init.yaml](cloud-init.yaml) into the provider's **User data**
field. It installs nginx (stream), Tailscale, Docker, ufw, fail2ban and
unattended-upgrades, and drops a `link-home` helper.

**Add an SSH key in the deploy form.** Without one you'll be sent a root
password instead, and the script deliberately won't disable password login
(so a keyless deploy can't lock you out).

Optionally set `TS_AUTHKEY` inside the script first
([generate one](https://login.tailscale.com/admin/settings/keys)) to join
the tailnet automatically; otherwise SSH in and run `sudo tailscale up`.

## 2. Point it at home

On the **home server**:

```bash
tailscale ip -4
```

On the **VPS**:

```bash
sudo link-home 100.x.y.z
```

That writes the nginx stream config, disables the default site, and reloads.
Re-run it any time the home server's tailnet IP changes.

## 3. DNS

At the schmidtiest.xyz registrar, add an A record per game
(`shootris` → the VPS's public IPv4). One IP serves unlimited subdomains —
routing happens by hostname at home, so you never need extra IPs.

## Notes

- Certificates are issued at home; ACME HTTP-01 works because :80 passes
  straight through.
- Rebuild this box from scratch in ~3 minutes by redeploying with the same
  user data. Nothing on it is precious.
- `$0` alternative to the whole VPS: Cloudflare Tunnel from the home server,
  at the cost of a Cloudflare dependency.
