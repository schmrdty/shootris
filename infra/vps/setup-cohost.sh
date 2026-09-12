#!/usr/bin/env bash
# Post-boot setup for a server that hosts game containers directly and
# terminates TLS with Caddy. Run this AFTER a rebuild with EMPTY user data —
# provisioning stays simple, and you watch every step instead of guessing.
#
#   curl -sL https://raw.githubusercontent.com/schmrdty/shootris/main/infra/vps/setup-cohost.sh | sudo bash
#
# Safe to re-run: every step is idempotent.
set -euo pipefail

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[0;32m%s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

step "Base packages"
apt-get update -qq
apt-get install -y -qq ufw fail2ban unattended-upgrades curl ca-certificates \
                       gnupg git debian-keyring debian-archive-keyring apt-transport-https
ok "installed"

step "Firewall (SSH + web only)"
ufw allow 22/tcp   >/dev/null
ufw allow 80/tcp   >/dev/null
ufw allow 443/tcp  >/dev/null
ufw --force enable >/dev/null
ok "$(ufw status | head -1)"

step "Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ok "enabled"

step "fail2ban (ssh brute-force protection)"
cat > /etc/fail2ban/jail.local <<'JAIL'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
JAIL
systemctl enable --now fail2ban >/dev/null 2>&1
ok "active"

step "Docker"
if command -v docker >/dev/null 2>&1; then
  ok "already installed: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker
  ok "$(docker --version)"
fi

step "Caddy"
if command -v caddy >/dev/null 2>&1; then
  ok "already installed: $(caddy version | head -1)"
else
  # Key fetched fresh — an expired repo key is what broke apt on the old box
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
  systemctl enable --now caddy
  ok "$(caddy version | head -1)"
fi

step "Result"
for svc in caddy docker fail2ban; do
  printf '    %-10s %s\n' "$svc" "$(systemctl is-active "$svc" 2>/dev/null || echo inactive)"
done
echo
echo "    Listening:"
ss -tlnp 2>/dev/null | awk 'NR>1 {print "      " $4 "  " $NF}' | sort -u | head -10

cat <<'NEXT'

Next:
  1. Restore your Caddyfile to /etc/caddy/Caddyfile (sites commented out)
  2. Clone the game, create .env.local, then:
       docker compose -f infra/docker-compose.cohost.yml up -d --build
       curl -I http://127.0.0.1:3000        # expect 200
  3. Add the site block, then ALWAYS validate before reloading:
       caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy

NOTE: SSH password login was left enabled. Once you confirm key login works:
  sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  systemctl restart ssh
NEXT
