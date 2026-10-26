# StageForce deployment

`compose.yaml` is the production file: it pulls the pinned `ghcr.io/progries/stageforce:<version>` image, runs behind the existing Traefik and keeps SQLite in the Docker volume `storage`. It has health checks, bounded logs, graceful shutdown and a read-only root filesystem. It does not install Traefik or configure DNS. Run one CRM instance on local disk. For development on your Mac use `compose.local.yaml` (see the [README](../README.md)).

## First deployment

### 1. Routing and configuration

Point `stageforce.jaimo.me` to the server. The existing Traefik container must share the external Docker network configured as `TRAEFIK_NETWORK`. Check its HTTPS entrypoint, certificate resolver and middleware names against `.env`.

```sh
git clone https://github.com/ProgRies/stageforce.git
cd stageforce
cp .env.example .env
```

Copy `.env.example` only on the first installation, then review `.env`:

| Setting | Default / meaning |
| --- | --- |
| `CRM_HOST` | `stageforce.jaimo.me`, hostname only |
| `CRM_IMAGE` | Exact published release, e.g. `ghcr.io/progries/stageforce:0.3.13`. Never `latest` |
| `TRUST_PROXY` | `1`: Traefik sets `X-Forwarded-For`; sign-in limits count per client address |
| `INTERNAL_DOMAINS` | `stage.bio,jaimo-solutions.com` (compose default): addresses that count as colleagues, not clients |
| `SNAPSHOT_INTERVAL_HOURS` | `6`: hours between automatic snapshots, `0` disables them |
| `SNAPSHOT_KEEP` | `28`: number of healthy snapshots kept |
| `TRAEFIK_NETWORK` | `reverse-proxy`, existing external network |
| `TRAEFIK_ENTRYPOINT` | `web-secure`, existing HTTPS entrypoint |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt`, existing certificate resolver |
| `TRAEFIK_MIDDLEWARES` | `default@file`; an explicitly empty value disables this assignment |

Compose derives `APP_URL=https://stageforce.jaimo.me` from `CRM_HOST`. No application port is published on the host.

### 2. Pull and start

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 crm
```

If pulling returns `denied`/`unauthorized`, the package is private: `docker login ghcr.io -u YOUR_GITHUB_USERNAME` with a token that has `read:packages`, typed at the password prompt, never into `.env`.

Check that the container becomes healthy and that https://stageforce.jaimo.me/ shows the login and https://stageforce.jaimo.me/healthz returns `{"ok":true}`.

Keep the deployment directory and Compose project name stable: Docker scopes the `storage` volume to that project, so a different name looks like an empty CRM.

### 3. Accounts

Create the accounts as described under [Accounts](#accounts), normally with `--temporary`. To move an existing local database instead, see [Move local work to the server](#move-local-work-to-the-server).

### 4. Connect the browser extension

Each colleague creates a key in the hosted CRM (gear → **Browser-Erweiterung verbinden**) and enters `https://stageforce.jaimo.me` with that key in the extension. Keys from a local database do not work against the server. See [extension-setup.md](extension-setup.md).

## Server requirements

- Keep `TRUST_PROXY=1` (the production default) when Traefik sits in front: sign-in limits count per client address, which the proxy appends to `X-Forwarded-For`. Use `TRUST_PROXY=0` only if clients connect to the container directly; without a proxy a trusted header could be forged.
- Set `NODE_ENV=production`, `APP_URL=https://<your-crm-host>` and the persistent `DATA_DIR`.
- Set `INTERNAL_DOMAINS=stage.bio,jaimo-solutions.com` (comma separated). Addresses on these domains, aliases like billing@ included, count as colleagues: they are never suggested as client contacts, and mail sent from them is filed as sent. CRM users' own domains always count.
- Put the service behind your HTTPS reverse proxy with a valid certificate. Do not expose the development port publicly.
- Route `/api/integrations/extension` to the application. It authenticates a personal bearer key, not Google credentials or a browser-only proxy login.
- Route `/api/live` to the application without response buffering and with a read timeout above one minute (nginx: `proxy_buffering off; proxy_read_timeout 120s;`). It is a long-lived Server-Sent Events stream that tells open tabs which organisations changed; the server sends a heartbeat every 25 seconds. It uses the normal session cookie and carries only organisation and user ids, never contents.
- The organisation map loads its tiles and place search through the CRM server, so browsers never contact a map provider and the CSP stays `'self'`. The server needs outbound HTTPS to `tile.openstreetmap.org` (tiles, cached for 30 days under `DATA_DIR/map-tiles`) and `nominatim.openstreetmap.org` (only text someone types into the place search, at most one request per second). The provider sees the server's address and a `StageForce CRM (<APP_URL>)` user agent, never organisation names, contacts or who is looking. Point `MAP_TILE_URL` (`…/{z}/{x}/{y}.png`) or `MAP_SEARCH_URL` (Nominatim-compatible) at another provider, or set either to an empty value to turn it off. The public OpenStreetMap servers are fine for a small team; heavy use needs your own or a commercial tile service.
- Never log request bodies or Authorization headers. Restrict server access and encrypt the host disk and backups.
- Create individual users. Every active CRM user currently has team-wide read/edit access; there are no per-organisation access rules.
- Pair each extension with the hosted CRM address and a key issued by that CRM.

The container runs as the unprivileged `node` user (UID 1000). Every write (database, snapshots, map tile cache) goes to `/app/data`; the root filesystem is read-only, with a bounded `/tmp`.

## Admin quick reference

| Situation | Command (in the deployment directory) |
| --- | --- |
| New colleague | `docker compose exec crm node server/cli.mjs user:add EMAIL "NAME" --temporary`, then share the starting password directly |
| Forgotten password | `… user:password EMAIL --temporary` |
| Lost phone and recovery codes | `… user:mfa-reset EMAIL` (check identity first) |
| Colleague leaves | `… user:disable EMAIL` |
| Who has set up two-factor sign-in | `… user:list` |
| Suspicious sign-ins | `… security:log [EMAIL] [COUNT]` |
| Are snapshots running | `… snapshot:list`, or `docker compose exec crm cat /app/data/snapshots/last-run.json` |
| Backup before an update | `… backup /app/data/backups/before-update.sqlite` |
| Did last night's NAS copy work | `tail /var/log/stageforce-backup.log` on the host (see [Copying snapshots to the NAS](#copying-snapshots-to-the-nas)) |

`…` stands for `docker compose exec crm node server/cli.mjs`. Details follow below.

## Accounts

```sh
docker compose exec crm node server/cli.mjs user:add colleague@example.com "Colleague" --temporary
docker compose exec crm node server/cli.mjs user:password colleague@example.com --temporary
docker compose exec crm node server/cli.mjs user:disable colleague@example.com
docker compose exec crm node server/cli.mjs user:mfa-reset colleague@example.com
docker compose exec crm node server/cli.mjs user:list
```

Passwords are entered at a hidden prompt and hashed with scrypt. Password reset and account disabling revoke sessions and extension keys. Session expiry is seven days; extension key expiry is 90 days. The current design uses one active extension key per CRM user.

With `--temporary`, the password you type is a starting password: after password and code, the user must choose their own before the CRM or the phone app opens (the server refuses everything else until then). Users can change their password at any time under Einstellungen → Passwort ändern with their current password; there is no e-mail confirmation. That ends their other sessions, including phones, and keeps the current one. Every password, temporary or not, needs at least 12 characters, so a starting password can be an easy-to-type phrase of that length that you share with the user directly.

Every sign-in needs a TOTP code from an authenticator app (or a single-use recovery code). New users set the app up on their first sign-in; they cannot reach the CRM before that. If a phone is lost and the recovery codes are gone, `user:mfa-reset` removes the old authenticator, ends the user's sessions and revokes their extension key; the next sign-in sets up a new app. Check identity out of band before resetting, because the reset leaves the password as the only factor until the user enrols again. `user:list` shows who has set up the app and how many recovery codes are left.

Creating a browser-extension key asks for a fresh authenticator code, because the key signs the extension in for 90 days without one.

Sign-in limits: 30 attempts per client address and 10 per account and address within ten minutes, and 50 per account within an hour. There is no team-wide limit, so one address cannot lock everybody out.

```sh
docker compose exec crm node server/cli.mjs security:log                       # latest 50 events
docker compose exec crm node server/cli.mjs security:log colleague@example.com 100
```

Security events (sign-ins, wrong passwords and codes, recovery-code use, MFA set-up and resets, browser keys created or revoked, CLI account changes) are kept for 90 days with time, account and client address. Each user sees their own under Einstellungen → Anmeldeaktivität, and the first screen after signing in warns about wrong passwords or codes since their previous sign-in.

## Backups and restore

### Automatic snapshots

The running application takes a consistent SQLite snapshot every `SNAPSHOT_INTERVAL_HOURS` (default 6) into `/app/data/snapshots/` and keeps the newest `SNAPSHOT_KEEP` healthy ones (default 28, about one week). No extra container or host cron job is needed. The schedule is based on the newest snapshot's age, so restarts neither skip nor duplicate a run; the first check happens one minute after startup. Set `SNAPSHOT_INTERVAL_HOURS=0` in `.env` to disable it.

Each run uses SQLite's online backup API, so it is safe while colleagues are working. The copy is converted into a single self-contained file (no `-wal`/`-shm` companions) and checked with `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Only a copy that passes gets a `crm-<UTC time>.sqlite.json` manifest with its SHA-256 hash, size, schema version and row counts. Copies that fail are deleted and never count as healthy. The outcome of the last run, including any error, is in `/app/data/snapshots/last-run.json` and the container log.

Snapshots live in the same Docker volume as the database. They protect against mistakes and corrupt writes, not against losing the server or its disk, so copy them off the host with your backup tool.

### Fetching the latest healthy snapshot

```sh
docker compose exec -T crm node server/cli.mjs snapshot:latest --stdout > stageforce-latest.sqlite
```

`snapshot:latest` re-checks the hash and SQLite integrity of each snapshot, newest first, and returns the first one that still passes. It exits non-zero with a message on stderr if none passes, so a backup tool can rely on the exit code. Options:

| Command | Output |
| --- | --- |
| `snapshot:latest` | Path inside the container, e.g. `/app/data/snapshots/crm-20261026T120000Z.sqlite` |
| `snapshot:latest --stdout` | The SQLite file itself, for piping into a backup tool |
| `snapshot:latest --json` | Manifest: file, path, created_at, bytes, sha256, schema, organisations, users |
| `--max-age-hours N` | Also fail if the latest healthy snapshot is older than N hours (alert on a stalled schedule) |
| `snapshot` | Take, verify and rotate a snapshot now; prints its path |
| `snapshot:list` | All snapshots with time, size and health |

Always pass `-T` with `--stdout` so Docker does not allocate a terminal and alter the binary stream. A nightly host cron job with a stale-schedule guard could look like:

```sh
cd /srv/stageforce && docker compose exec -T crm node server/cli.mjs snapshot:latest --stdout --max-age-hours 12 > /backup/stageforce-$(date +%F).sqlite
```

### Encrypting snapshots before they leave the server

Snapshots contain customer data, password hashes, authenticator secrets and extension key hashes. Encrypt them on the host before handing them to off-site storage. With [age](https://age-encryption.org) and a public key whose private key is kept off the server:

```sh
docker compose exec -T crm node server/cli.mjs snapshot:latest --stdout --max-age-hours 12 | age -r age1yourpublickey... > /backup/stageforce-$(date +%F).sqlite.age
```

To restore, decrypt with `age -d -i key.txt stageforce-....sqlite.age > known-good.sqlite` on a trusted machine and follow the restore steps below. Only the public key is on the server, so a compromised server cannot read older encrypted backups. If your backup tool already encrypts (restic, Borg), pipe the `--stdout` output into it instead.

### Copying snapshots to the NAS

`scripts/backup-to-nas.sh` runs on the Docker host. It fetches the latest healthy snapshot, can encrypt it with age, and copies it to the NAS with rsync over SSH. It also deletes copies on the NAS that are older than `NAS_KEEP_DAYS`. If anything fails, it exits non-zero and logs one line with the reason. Copies are named `stageforce-<UTC time>.sqlite[.age]`, each with a `.sha256` file next to it.

**One-time setup on the host** (as a user that may run `docker`, e.g. root):

1. Install `rsync` (and `age` if you want encryption) on the host. The NAS needs SSH and rsync enabled. On Synology, that's Control Panel → Terminal & SNMP → SSH, plus File Services → rsync.
2. Create a NAS user with write access to a backup folder only, e.g. `/volume1/backups/stageforce`.
3. Create a dedicated SSH key without a passphrase and add it to that user on the NAS:

   ```sh
   ssh-keygen -t ed25519 -N '' -f /root/.ssh/stageforce-nas -C stageforce-backup
   ssh-copy-id -i /root/.ssh/stageforce-nas.pub stageforce@nas.local
   ssh -i /root/.ssh/stageforce-nas stageforce@nas.local true   # must succeed without a prompt
   ```

4. Write the configuration to `/etc/stageforce-backup.env` (mode 600):

   ```sh
   NAS_TARGET=stageforce@nas.local:/volume1/backups/stageforce
   SSH_KEY=/root/.ssh/stageforce-nas
   DEPLOY_DIR=/srv/stageforce            # folder with compose.yaml and .env
   NAS_KEEP_DAYS=30                      # 0 = never delete on the NAS
   MAX_AGE_HOURS=12                      # fail if snapshots have stopped
   # AGE_RECIPIENTS=/etc/stageforce-backup.age-recipients   # file with age public key(s); enables encryption
   ```

5. Do a test run, then check the NAS folder:

   ```sh
   BACKUP_CONFIG=/etc/stageforce-backup.env /srv/stageforce/scripts/backup-to-nas.sh
   ```

**Cron** (`crontab -e` as the same user). This runs nightly at 02:30 and appends to a log file:

```cron
PATH=/usr/local/bin:/usr/bin:/bin
30 2 * * * BACKUP_CONFIG=/etc/stageforce-backup.env /srv/stageforce/scripts/backup-to-nas.sh >>/var/log/stageforce-backup.log 2>&1
```

A failed run ends with a line containing `FAILED`. To be told about failures, leave out the log redirect so cron mails the output, or have your monitoring check that the newest file on the NAS is less than a day old. With snapshots every 6 hours, running the script more often (e.g. `30 */6 * * *`) gives a newer off-site copy at the cost of more files on the NAS.

**How it stays safe:** the CLI only hands out a snapshot that passes its hash and integrity check. The script also checks the SQLite header before sending. rsync writes to a temporary name and renames only when the copy is complete. Old copies on the NAS are deleted only after this run's copy has arrived there, so a broken upload never empties the folder. A copy waits in `STAGING_DIR` (default `/var/backups/stageforce`, mode 700) only until the next run. With `AGE_RECIPIENTS` set, only the encrypted file is kept there and sent, and the NAS cannot read the backups without the private key. Keep that key off the server, e.g. in a password manager.

**Restore from the NAS:** copy a file back to the host and check it with `sha256sum -c <file>.sha256`. If it's encrypted, decrypt it with `age -d -i key.txt`. Then follow the stopped-instance restore below.

### Manual backup and restore

`backup FILE` writes a one-off consistent backup to any path, for example before an update:

```sh
docker compose exec crm node server/cli.mjs backup /app/data/backups/before-update.sqlite
docker compose cp crm:/app/data/backups/before-update.sqlite ./before-update.sqlite
```

For a restore, first make a fresh backup of the current instance. Then, with a known-good backup or snapshot in a private host path:

```sh
docker compose stop crm
docker compose run --rm --no-deps --entrypoint sh -v /absolute/private/path/known-good.sqlite:/restore.sqlite:ro crm -c 'cp /restore.sqlite /app/data/crm.sqlite && rm -f /app/data/crm.sqlite-wal /app/data/crm.sqlite-shm && chmod 600 /app/data/crm.sqlite'
docker compose up -d
```

Removing WAL/SHM files is appropriate only for this stopped-instance restore. Never remove them from a running application. A backup includes users, password hashes, MFA secrets and extension keys, so a restore also restores account state; reset affected passwords after an account compromise.

### Reset to an empty database

```sh
docker compose exec crm node server/cli.mjs backup /app/data/backups/before-reset.sqlite
docker compose cp crm:/app/data/backups/before-reset.sqlite ./before-reset.sqlite
docker compose down -v
docker compose up -d
```

`down -v` deletes the whole `storage` volume: database, snapshots, in-volume backups and the map tile cache. Use it only for a deliberate reset, never for an update.

## Updates

Before an update, take a backup and copy it off the container (see above). Keep `.env`, the Compose project name and the volume.

```sh
git pull --ff-only
```

Set `CRM_IMAGE` in `.env` to the new exact version, then:

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

Startup migrates the database schema automatically. For a rollback after a schema change, restore the matching backup as well as the previous image.

## Move local work to the server

Use a backup of the full local SQLite database. It keeps organisations, contacts, history, accounts, password hashes and MFA set-ups. On your Mac, in the repository folder:

```sh
docker compose -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/transfer.sqlite
docker compose -f compose.local.yaml cp crm:/app/data/transfer.sqlite ./stageforce-transfer.sqlite
```

Give that file to the server administrator through a secure channel, never Git or a public upload. The administrator restores it with the stopped-instance procedure above, using the same or a newer application version. Browser-extension keys must then be recreated against the hosted CRM.

## GitHub account and repository

Whoever can push to `main` and publish a release controls what the server can run. Turn on two-factor authentication for every account with write access, and protect `main` (Settings → Branches: require a pull request before merging, block force pushes and deletion).
