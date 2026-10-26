#!/bin/sh
# Copies the latest healthy StageForce snapshot to a NAS over SSH. Runs on the Docker host, e.g. from cron.
# Configuration comes from the environment or from a file named by BACKUP_CONFIG (see docs/deployment.md):
#   NAS_TARGET        required, rsync destination, e.g. stageforce@nas.local:/volume1/backups/stageforce
#   DEPLOY_DIR        folder with compose.yaml and .env (default: the repository this script is in)
#   SSH_KEY           private key for the NAS login (default: ssh's own default key)
#   AGE_RECIPIENTS    file with age public keys; if set, only encrypted copies leave the server
#   MAX_AGE_HOURS     fail if the newest healthy snapshot is older than this (default 12)
#   NAS_KEEP_DAYS     delete copies older than this on the NAS; 0 keeps everything (default 30)
#   STAGING_DIR       local folder for the copy being sent (default /var/backups/stageforce)
# Exits non-zero on any failure, so cron mail or a monitoring wrapper notices.
set -eu
umask 077
if [ -n "${BACKUP_CONFIG:-}" ]; then . "$BACKUP_CONFIG"; fi
: "${NAS_TARGET:?Set NAS_TARGET, e.g. stageforce@nas.local:/volume1/backups/stageforce}"
DEPLOY_DIR=${DEPLOY_DIR:-$(cd "$(dirname "$0")/.." && pwd)}
MAX_AGE_HOURS=${MAX_AGE_HOURS:-12}
NAS_KEEP_DAYS=${NAS_KEEP_DAYS:-30}
STAGING_DIR=${STAGING_DIR:-/var/backups/stageforce}
SSH="ssh -o BatchMode=yes${SSH_KEY:+ -i $SSH_KEY}"
log(){ echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) stageforce-backup: $*" >&2; }
trap 'status=$?; rm -f "$STAGING_DIR"/.incoming.*; [ $status -eq 0 ] || log "FAILED (exit $status)"' EXIT

mkdir -p "$STAGING_DIR"
name=stageforce-$(date -u +%Y%m%dT%H%M%SZ).sqlite
tmp=$(mktemp "$STAGING_DIR/.incoming.XXXXXX")
cd "$DEPLOY_DIR"
# The CLI re-verifies hash and integrity and exits non-zero if no fresh healthy snapshot exists.
docker compose exec -T crm node server/cli.mjs snapshot:latest --stdout --max-age-hours "$MAX_AGE_HOURS" >"$tmp"
[ "$(head -c 15 "$tmp")" = "SQLite format 3" ] || { log "snapshot stream is not a SQLite database"; exit 1; }
if [ -n "${AGE_RECIPIENTS:-}" ]; then
 name=$name.age
 age -R "$AGE_RECIPIENTS" -o "$tmp.age" "$tmp" && mv "$tmp.age" "$tmp" || { rm -f "$tmp.age"; exit 1; }
fi
rm -f "$STAGING_DIR"/stageforce-*
mv "$tmp" "$STAGING_DIR/$name"
(cd "$STAGING_DIR" && sha256sum "$name" >"$name.sha256")

# rsync writes to a temporary name and renames on completion, so the NAS never holds a half-written copy.
# The checksum file goes last: its presence marks a complete upload.
rsync -t --chmod=F600 -e "$SSH" "$STAGING_DIR/$name" "$STAGING_DIR/$name.sha256" "$NAS_TARGET/"
log "uploaded $name ($(wc -c <"$STAGING_DIR/$name") bytes) to $NAS_TARGET"

if [ "$NAS_KEEP_DAYS" -gt 0 ]; then
 host=${NAS_TARGET%%:*} dir=${NAS_TARGET#*:}
 # Never prune if this run's copy is not on the NAS, so a broken upload cannot empty the backup folder.
 pruned=$($SSH "$host" "cd '$dir' && test -s '$name.sha256' && find . -maxdepth 1 -name 'stageforce-*' -mtime +$NAS_KEEP_DAYS -print -delete") || { log "pruning old copies on the NAS failed"; exit 1; }
 [ -z "$pruned" ] || log "pruned on NAS: $(echo $pruned)"
fi
