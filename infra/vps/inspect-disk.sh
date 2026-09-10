#!/usr/bin/env bash
# Inspect a server's disk OFFLINE from rescue mode — nothing on the target
# system runs, so nothing can be damaged or triggered.
#
# In rescue mode:
#   lsblk                      # find the root partition
#   mount /dev/sda2 /mnt       # or whatever lsblk showed
#   curl -sL https://raw.githubusercontent.com/schmrdty/shootris/main/infra/vps/inspect-disk.sh | bash
#
# Optional: pass a different mount point --  ... | bash -s /mnt/root
set -uo pipefail
R="${1:-/mnt}"

[ -d "$R/etc" ] || { echo "No /etc under $R — is the disk mounted there?"; exit 1; }
line() { printf '\n=== %s ===\n' "$1"; }

line "WHAT OS"
cat "$R/etc/os-release" 2>/dev/null | head -3

line "WHICH DOMAINS THIS BOX SERVED (issued certificates)"
ls -1 "$R/etc/letsencrypt/live" 2>/dev/null | grep -v README || echo "(no letsencrypt certs)"
find "$R" -maxdepth 6 -name 'acme.json' 2>/dev/null | head -5

line "WEB SERVER CONFIG"
for d in etc/nginx/sites-enabled etc/nginx/conf.d etc/caddy etc/traefik etc/apache2/sites-enabled; do
  [ -d "$R/$d" ] && { echo "-- /$d --"; ls -1 "$R/$d"; }
done

line "ENABLED SERVICES (what starts on boot)"
ls -1 "$R/etc/systemd/system/multi-user.target.wants" 2>/dev/null
echo "-- custom unit files --"
ls -1 "$R/etc/systemd/system/"*.service 2>/dev/null | xargs -r -n1 basename

line "APPLICATION DIRECTORIES"
for d in srv opt var/www home root; do
  [ -d "$R/$d" ] && { echo "-- /$d --"; ls -1 "$R/$d" 2>/dev/null | head -25; }
done

line "DOCKER DATA"
[ -d "$R/var/lib/docker" ] && {
  echo "-- volumes --"; ls -1 "$R/var/lib/docker/volumes" 2>/dev/null | head -20
  echo "-- compose files found --"
  find "$R/srv" "$R/opt" "$R/home" "$R/root" -maxdepth 4 \
       \( -name 'docker-compose*.y*ml' -o -name 'compose.y*ml' \) 2>/dev/null | head -20
} || echo "(docker not installed)"

line "WHAT PAST-YOU WAS DOING (shell history)"
for h in "$R/root/.bash_history" "$R"/home/*/.bash_history; do
  [ -f "$h" ] && { echo "-- $h (last 40) --"; tail -40 "$h"; }
done

line "SCHEDULED JOBS"
cat "$R/var/spool/cron/crontabs/root" 2>/dev/null || echo "(no root crontab)"
ls -1 "$R/etc/cron.d" 2>/dev/null

line "ENV / SECRETS FILES (names only — inspect by hand)"
find "$R/srv" "$R/opt" "$R/home" "$R/root" -maxdepth 4 -name '.env*' 2>/dev/null | head -20

line "DISK USE — where the data actually is"
du -sh "$R"/{srv,opt,var/www,home,root,var/lib/docker} 2>/dev/null | sort -rh | head -10

printf '\nRead-only inspection complete. Nothing on the disk was modified.\n'
