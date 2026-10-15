# Stage Force deployment

## First production deployment (GHCR)

The production Compose file runs the published `ghcr.io/progries/stageforce:latest` image on amd64 or arm64. It includes persistent SQLite storage, health checks, bounded logs, graceful shutdown and a read-only root filesystem. It does not install Traefik or configure DNS. Run one CRM instance on local storage.

The `latest` tag advances on releases from `main`; updates still require an explicit pull and `up`. To pin a release for rollback, set `CRM_IMAGE=ghcr.io/progries/stageforce:0.1.12` (or the relevant published version).

### 1. Prepare routing and configuration

Point `stageforce.jaimo.me` to the server. The existing Traefik container must share the external Docker network configured as `TRAEFIK_NETWORK`. Verify its HTTPS entrypoint, certificate resolver and middleware names; the supplied defaults match the earlier Glass Board deployment conventions. If that external network is missing, check the actual Traefik configuration rather than creating an unrelated network.

From a stable deployment directory:

```sh
git clone https://github.com/ProgRies/stageforce.git
cd stageforce
cp .env.example .env
```

If Compose reports `CRM_HOST is missing`, the production `.env` has not been created or does not define that value. Run the commands from this directory. For **local Mac testing**, use `docker compose -p stageforce-real -f compose.local.yaml up -d --build` instead; this local file needs no production `.env` or Traefik. Omit the project flag only if your existing local instance uses the default project.

Copy `.env.example` only on the first installation. Review `.env`:

| Setting | Default / meaning |
| --- | --- |
| `CRM_HOST` | `stageforce.jaimo.me`, hostname only |
| `CRM_IMAGE` | `ghcr.io/progries/stageforce:latest`, latest published release |
| `TRAEFIK_NETWORK` | `reverse-proxy`, existing external network |
| `TRAEFIK_ENTRYPOINT` | `web-secure`, existing HTTPS entrypoint |
| `TRAEFIK_CERTRESOLVER` | `letsencrypt`, existing certificate resolver |
| `TRAEFIK_MIDDLEWARES` | `default@file`, existing middleware; an explicitly empty value disables this assignment |

Compose derives `APP_URL=https://stageforce.jaimo.me` from `CRM_HOST`. No application port is exposed directly to the host. Do not add a second browser login/SSO challenge in front of `/api/integrations/gmail/`: Google authenticates there with the application’s scoped Gmail key. The administrator should review the existing middleware rather than broadly disable server security. Do not log request bodies or Authorization headers.

### 2. Pull and start

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 crm
```

A public GHCR package needs no registry login. If pulling returns `denied`/`unauthorized`, the administrator must confirm package access and use `docker login ghcr.io -u YOUR_GITHUB_USERNAME` with an authorized token (classic PAT with `read:packages` and package access), or the package owner can intentionally make the image public. Enter the token at the password prompt, never in this repository or `.env`. GitHub repository access and container-package visibility are separate.

Check that the container becomes healthy, and that these URLs work over valid public HTTPS:

- https://stageforce.jaimo.me/ — login screen
- https://stageforce.jaimo.me/healthz — `{"ok":true}`
- https://stageforce.jaimo.me/assets/stageforce-icon.svg — add-on icon

Keep the deployment directory/project name stable: Docker scopes the `storage` volume to that project. Changing the project name can make the application appear empty by selecting a different volume. Health checks report failures; they do not themselves restart an unhealthy running process.

### 3. Choose the data source and account

**If local cleanup should be preserved:** use the full SQLite backup and restore instructions below. This includes the existing users, passwords and CRM history. Do not reimport the original snapshot or create the same user again.

**If starting empty:** create the first user through the terminal:

```sh
docker compose exec crm node server/cli.mjs user:add ries@jaimo-solutions.com "Christian Ries"
```

Choose a password of at least 12 characters at the hidden prompt. There is no signup page. Import the private original snapshot once using the [README instructions](../README.md#import-the-real-crm-exactly-once), if needed. No customer data is included in the image.

### 4. Connect the already-installed Gmail add-on

1. In Apps Script, set `CRM_ORIGIN` in `Code.gs` to `https://stageforce.jaimo.me`. Replace the example hostname in all three manifest entries: fetch allowlist, logo URL and open-link prefix. Preserve their existing paths and trailing slashes. Save and reload Gmail.
2. Log into **the hosted CRM** as `ries@jaimo-solutions.com`, matching the primary Google account. Open **⚙ → Gmail verbinden → Schlüssel erstellen**.
3. Paste the new key into **Verbindungsschlüssel** in the Gmail sidebar and click **Verbinden**. A key from a separate localhost database will not authenticate against this server.
4. Open an existing email, click **E-Mail zuordnen**, then confirm the organisation, contacts and timeline placement in the Gmail sidebar. Click **Im CRM speichern**. Reimport it to check duplicate handling.

The add-on only reads the selected message on request. It does not send, draft, delete or modify email. See [gmail-setup.md](gmail-setup.md) for installation and troubleshooting. Live Google delivery must be tested after deployment; repository/container checks cannot verify your server's DNS, TLS or Workspace policy.

## Boundaries

One Node service and one SQLite volume on the same host. Traefik terminates HTTPS. Production `APP_URL` must equal the browser's origin exactly (scheme and hostname). Browser mutations require Origin and session CSRF checks. The dedicated Gmail endpoints require a separate bearer key and reject browser Origin headers. Capture-only keys cannot read CRM data or confirm imports. Newly issued sidebar-review keys additionally permit limited organisation search, review context and explicit confirmation of the owning user’s imports, never general CRM API access. It does not trust forwarded host headers. No server port is published in the production Compose file.

The container runs as the unprivileged `node` user (UID 1000). Docker initializes the named volume from the image's owned `/app/data`. If using a host bind mount instead, provision that directory for UID/GID 1000; do not make it world-writable. The production root filesystem is read-only, with a writable data volume and bounded `/tmp`.

Account sessions expire after seven days. Password changes and account disabling revoke existing sessions and Gmail keys. Passwords use scrypt with independent random salts. Every user can read and edit CRM data; only the server operator can manage accounts. There are no default credentials, self-service registration or mail-sending endpoints.

The browser renders email content as text, never as sender-provided HTML. No remote images, attachment fetches or embedded tracking resources are loaded. Uploads are limited to 10 MB and two concurrently parsed messages; body text has a 500,000-character limit. Rate limits cover uploads and login attempts. Pending email text is stored for at most 24 hours and cleaned up once per minute while the application is running. Restarted servers clean up stale imports too.

## Backups and restore

Use the documented CLI `backup` command for a consistent online backup. Schedule it through your server's existing backup tooling and keep encrypted/restricted copies off the CRM host. This release supplies the backup command, not an automatic backup schedule.

For a restore, first make a fresh backup of the current instance and stop it. From the source directory, with a known-good backup in a private host path:

```sh
docker compose stop crm
docker compose run --rm --no-deps --entrypoint sh -v /absolute/private/path/known-good.sqlite:/restore.sqlite:ro crm -c 'cp /restore.sqlite /app/data/crm.sqlite && rm -f /app/data/crm.sqlite-wal /app/data/crm.sqlite-shm && chmod 600 /app/data/crm.sqlite'
docker compose up -d
```

Removing WAL/SHM files is appropriate only for this stopped-instance restore from a consistent backup. Never remove them from a running application. The backup includes users and Gmail keys, so restore also restores accounts/session/key state; reset affected passwords if restoring after an account compromise.

## Updates

Before an update, take a consistent backup and copy it off the container. Keep the existing `.env`, Compose project name and volume. Do not run `docker compose down -v`: it removes the database volume.

```sh
docker compose exec crm node server/cli.mjs backup /app/data/backups/before-update.sqlite
docker compose cp crm:/app/data/backups/before-update.sqlite ./before-update.sqlite
git pull --ff-only
```

Set `CRM_IMAGE` in the existing `.env` to `ghcr.io/progries/stageforce:latest` (or a published version tag to pin a release). An old `.env` containing `stageforce:0.1.10` overrides the new default and must be updated. Then:

```sh
docker compose config --quiet
docker compose pull
docker compose up -d
docker compose ps
```

Startup applies supported additive database migrations automatically; do not repeat the initial spreadsheet import. For rollback after a schema change, restore the matching backup as well as the previous image. Configuration-only commits do not require a new image release. Source builds for local testing still use `compose.local.yaml`.

## Verification performed for this release

- TypeScript check and optimized UI build.
- Isolated service and HTTP tests, including authenticated mutations, CSRF/origin rejection, duplicate imports/retries, conflict detection, MIME handling, migration and SQLite backup/reopen.
- Full real-snapshot migration, row counts, foreign-key/integrity checks and representative search/list timing.
- Production dependency audit.

Docker builds, login and restart persistence are tested by GitHub Actions before image publication. Browser rendering has not been manually verified in the current build environment. The administrator should also test the two UI flows over the final HTTPS hostname before the team cuts over. The original hosted prototype remains separate.

## Gmail add-on

See [gmail-setup.md](gmail-setup.md). Google must reach the HTTPS hostname and `/api/integrations/gmail/` without a browser-only proxy login. The application still authenticates each request with a dedicated key. Proxy access logs must not log Authorization headers or request bodies. No CORS relaxation is needed. Google credentials are never placed in the CRM container.

## Move local work to the server

Use the full local SQLite database after cleanup, not the original spreadsheet snapshot. The backup preserves organisations, contacts, history, approved email text, links, accounts and password hashes. Pending reviews still expire after 24 hours; confirm relevant work before the move.

At cutover, stop making local edits and take the final consistent backup from the repository directory. Use the same Compose project as your local instance. For Christian’s Mac installation (`stageforce-real`):

```sh
docker compose -p stageforce-real -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/transfer.sqlite
docker compose -p stageforce-real -f compose.local.yaml cp crm:/app/data/transfer.sqlite ./stageforce-transfer.sqlite
```

For an installation started without `-p stageforce-real`, omit that flag from both commands.

Give that private backup to the server administrator through your normal secure transfer method. Do not commit or publicly upload it. The administrator should use the stopped-instance restore procedure above with this file and the same or a newer application version. Confirm login, representative recent edits and history on the HTTPS site, then continue working only on that hosted instance. Keep the local copy as a fallback until the transfer is verified. Do not re-run the spreadsheet migration or create replacement accounts after restoring the database.
