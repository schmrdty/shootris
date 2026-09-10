#!/usr/bin/env bash
# READ-ONLY inventory of an existing server. Changes nothing, starts nothing,
# stops nothing. Run this BEFORE deciding whether a box can be reused:
#   scp infra/vps/inventory.sh root@<ip>:/tmp/ && ssh root@<ip> 'bash /tmp/inventory.sh'
set -uo pipefail

line() { printf '\n=== %s ===\n' "$1"; }

line "HOST"
hostnamectl 2>/dev/null | sed -n '1,6p'
uptime

line "WHAT IS LISTENING (the important one)"
ss -tlnp 2>/dev/null | awk 'NR==1 || /LISTEN/'

line "RUNNING SERVICES"
systemctl list-units --type=service --state=running --no-pager --no-legend 2>/dev/null | awk '{print $1}'

line "DOCKER"
if command -v docker >/dev/null 2>&1; then
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null
  echo "-- compose projects --"
  docker ps -a --filter label=com.docker.compose.project \
    --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | sort -u
else
  echo "docker not installed"
fi

line "WEB SERVER CONFIG"
for d in /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/caddy /etc/apache2/sites-enabled /etc/traefik; do
  [ -d "$d" ] && { echo "-- $d --"; ls -1 "$d"; }
done

line "TLS CERTIFICATES ISSUED (tells you which domains this box serves)"
[ -d /etc/letsencrypt/live ] && ls -1 /etc/letsencrypt/live 2>/dev/null
find / -name 'acme.json' -not -path '*/proc/*' 2>/dev/null | head -5

line "APP DIRECTORIES"
for d in /srv /opt /var/www /home /root; do
  [ -d "$d" ] && { echo "-- $d --"; ls -1 "$d" 2>/dev/null | head -20; }
done

line "SCHEDULED JOBS"
crontab -l 2>/dev/null || echo "no root crontab"
ls -1 /etc/cron.d 2>/dev/null

line "DISK / MEMORY"
df -h / /var 2>/dev/null | grep -v tmpfs
free -h

line "RECENT LOGINS"
last -n 8 2>/dev/null | head -8

printf '\nInventory complete. Nothing was modified.\n'
