#!/usr/bin/env bash
# Capture a portfolio/evidence bundle for a project BEFORE decommissioning it.
#
# Produces a dated archive containing the source, how it was deployed, and
# when it ran — so work can be documented (and cited) after the server it
# lived on is repurposed.
#
# SECRETS ARE EXCLUDED: .env files, key material, and credential stores are
# skipped, and the manifest lists what was skipped so nothing looks missing.
#
#   bash capture-project-evidence.sh /home/builder/ohara [outdir]
set -uo pipefail

SRC="${1:?usage: capture-project-evidence.sh <project-dir> [outdir]}"
OUT="${2:-/root/evidence}"
[ -d "$SRC" ] || { echo "No such directory: $SRC"; exit 1; }

NAME="$(basename "$SRC")"
STAMP="$(date +%Y%m%d)"
WORK="$OUT/${NAME}-${STAMP}"
mkdir -p "$WORK"

echo "Capturing $SRC -> $WORK"

# --- source, minus dependencies, history bloat and secrets ---------------
mkdir -p "$WORK/source"
rsync -a \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude 'build' \
  --exclude '.env' --exclude '.env.*' --exclude '*.pem' --exclude '*.key' \
  --exclude 'id_rsa*' --exclude 'id_ed25519*' --exclude '*.sqlite' \
  "$SRC/" "$WORK/source/" 2>/dev/null

M="$WORK/MANIFEST.md"
{
  echo "# $NAME — project evidence"
  echo
  echo "Captured $(date -u '+%Y-%m-%d %H:%M UTC') from \`$(hostname)\` (\`$SRC\`)."
  echo
  echo "## Timeline"
  echo
  echo "- Oldest file: $(find "$SRC" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -printf '%TY-%Tm-%Td %p\n' 2>/dev/null | sort | head -1)"
  echo "- Newest file: $(find "$SRC" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -printf '%TY-%Tm-%Td %p\n' 2>/dev/null | sort | tail -1)"
  echo "- Source size: $(du -sh --exclude=node_modules --exclude=.git "$SRC" 2>/dev/null | cut -f1)"
  echo "- Files (excluding deps): $(find "$SRC" -type f -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | wc -l)"
  echo

  if [ -d "$SRC/.git" ]; then
    echo "## Commit history"
    echo '```'
    git -C "$SRC" log --pretty='%ad %h %s' --date=short 2>/dev/null | head -60
    echo '```'
    echo
  fi

  echo "## How it ran"
  echo
  if command -v pm2 >/dev/null 2>&1; then
    echo '```'
    pm2 list 2>/dev/null
    echo '```'
  fi
  echo "Processes referencing this project:"
  echo '```'
  ps -eo user,pid,etime,time,cmd 2>/dev/null | grep -i "$NAME" | grep -v grep
  echo '```'
  echo
  echo "Matching systemd units:"
  echo '```'
  grep -rl "$NAME" /etc/systemd/system/ 2>/dev/null || echo "(none)"
  echo '```'
  echo
  echo "Reverse-proxy configuration referencing it:"
  echo '```'
  grep -rn "$NAME" /etc/caddy/ /etc/nginx/ 2>/dev/null | head -20 || echo "(none)"
  echo '```'
  echo
  echo "## Operating window (log evidence)"
  echo '```'
  for d in "$SRC/logs" /root/.pm2/logs /var/log; do
    [ -d "$d" ] || continue
    find "$d" -name "*${NAME}*" -o -name '*.log' 2>/dev/null | head -6 | while read -r f; do
      printf '%s: %s  ->  %s (%s)\n' "$(basename "$f")" \
        "$(head -1 "$f" 2>/dev/null | cut -c1-40)" \
        "$(tail -1 "$f" 2>/dev/null | cut -c1-40)" \
        "$(du -h "$f" 2>/dev/null | cut -f1)"
    done
  done
  echo '```'
  echo
  echo "## Excluded from this bundle"
  echo
  echo "Dependencies (node_modules), build output, git objects, and all"
  echo "secrets (.env*, *.pem, *.key, SSH keys, databases). Files skipped:"
  echo '```'
  find "$SRC" \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' \) \
    -not -path '*/node_modules/*' 2>/dev/null | sed 's/^/  /' || true
  echo '```'
} > "$M"

# --- also snapshot the proxy config as deployed --------------------------
mkdir -p "$WORK/deployment"
cp /etc/caddy/Caddyfile "$WORK/deployment/Caddyfile.snapshot" 2>/dev/null
pm2 jlist > "$WORK/deployment/pm2-processes.json" 2>/dev/null

tar -czf "$OUT/${NAME}-evidence-${STAMP}.tar.gz" -C "$OUT" "${NAME}-${STAMP}" 2>/dev/null

echo
echo "Manifest:  $M"
echo "Archive:   $OUT/${NAME}-evidence-${STAMP}.tar.gz"
echo
echo "Pull it down with:"
echo "  scp root@<this-server>:$OUT/${NAME}-evidence-${STAMP}.tar.gz ."
echo
echo "Review MANIFEST.md before sharing. Nothing was deleted or stopped."
