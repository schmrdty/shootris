#!/usr/bin/env bash
# Full pre-reinstall backup of a server: every project plus the config that
# explains how they ran. Excludes only what can be regenerated.
#
#   sudo bash backup-server.sh [outdir]     # default /home/builder/backup
#
# THIS ARCHIVE CONTAINS SECRETS (.env files, keys, tokens) — that is
# deliberate, because it is a RESTORE backup, not something to share.
# Store it somewhere private. Use capture-project-evidence.sh instead for
# anything you intend to publish.
set -uo pipefail

OUT="${1:-/home/builder/backup}"
STAMP="$(date +%F)"
mkdir -p "$OUT"

# Reproducible or worthless — skipped everywhere. Note .git is KEPT: commit
# history is usually the most valuable thing in an abandoned project.
EXCLUDES=(
  --exclude='node_modules' --exclude='.next' --exclude='dist' --exclude='build'
  --exclude='.cache' --exclude='.npm' --exclude='.pnpm-store' --exclude='.yarn'
  --exclude='__pycache__' --exclude='.venv' --exclude='venv' --exclude='*.pyc'
  --exclude='target' --exclude='vendor'
  --exclude='*.bak' --exclude='*.log' --exclude='*.sock'
)

echo "=== What is here (excluding node_modules) ==="
for d in /srv /home /var/www; do
  [ -d "$d" ] || continue
  du -sh --exclude=node_modules --exclude=.next "$d"/* 2>/dev/null | sort -rh | head -20
done

archive() {  # archive <name> <parent-dir> <target>
  local name="$1" parent="$2" target="$3"
  [ -e "$parent/$target" ] || { echo "skip $target (absent)"; return; }
  echo "-> archiving $target"
  tar -czf "$OUT/${name}-${STAMP}.tar.gz" "${EXCLUDES[@]}" -C "$parent" "$target" 2>/dev/null
}

echo
echo "=== Archiving ==="
archive srv       /      srv                      # all projects
archive home      /      home                     # ohara, pm2 config, dotfiles
archive www       /var   www                      # static sites
archive caddy     /etc   caddy                    # how everything was routed
archive systemd   /etc/systemd system             # custom units
archive nginx     /etc   nginx                    # if present

# Small but important: crontabs, enabled services, installed package list —
# these reconstruct the machine's behaviour, not just its files.
{
  echo "# Host: $(hostname)   Captured: $(date -u)"
  echo; echo "## Enabled services"
  systemctl list-unit-files --state=enabled --no-pager --no-legend 2>/dev/null
  echo; echo "## Listening ports"
  ss -tlnp 2>/dev/null
  echo; echo "## Root crontab"
  crontab -l 2>/dev/null || echo "(none)"
  echo; echo "## PM2 processes"
  sudo -u builder pm2 jlist 2>/dev/null || pm2 jlist 2>/dev/null || echo "(pm2 unavailable)"
  echo; echo "## Manually installed packages"
  apt-mark showmanual 2>/dev/null
} > "$OUT/system-state-${STAMP}.txt"
echo "-> wrote system-state-${STAMP}.txt"

chown -R builder:builder "$OUT" 2>/dev/null

echo
echo "=== Result ==="
ls -lh "$OUT"
echo
echo "Total: $(du -sh "$OUT" | cut -f1)"
echo
echo "Pull to your machine, then VERIFY sizes before reinstalling:"
echo "  scp 'builder@<server>:${OUT}/*' ."
echo
echo "Check an archive is readable without extracting:"
echo "  tar -tzf srv-${STAMP}.tar.gz | head"
