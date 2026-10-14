# Stage Force deployment

## Boundaries

One Node service and one SQLite volume on the same host. Traefik terminates HTTPS. Production `APP_URL` must equal the browser's origin exactly (scheme and hostname). The application checks Origin and session CSRF tokens for mutations. It does not trust forwarded host headers. No server port is published in the production Compose file.

The container runs as the unprivileged `node` user (UID 1000). Docker initializes the named volume from the image's owned `/app/data`. If using a host bind mount instead, provision that directory for UID/GID 1000; do not make it world-writable. The production root filesystem is read-only, with a writable data volume and bounded `/tmp`.

Account sessions expire after seven days. Password changes and account disabling revoke existing sessions. Passwords use scrypt with independent random salts. Every user can read and edit CRM data; only the server operator can manage accounts. There are no default credentials, self-service registration or mail-sending endpoints.

The browser renders email content as text, never as sender-provided HTML. No remote images, attachment fetches or embedded tracking resources are loaded. Uploads are limited to 10 MB and two concurrently parsed messages; body text has a 500,000-character limit. Rate limits cover uploads and login attempts. Pending email text is stored for at most 24 hours and cleaned up once per minute while the application is running. Restarted servers clean up stale imports too.

## Backups and restore

Use the documented CLI `backup` command for a consistent online backup. Schedule it through your server's existing backup tooling and keep encrypted/restricted copies off the CRM host. This release supplies the backup command, not an automatic backup schedule.

For a restore, first make a fresh backup of the current instance and stop it. From the source directory, with a known-good backup in a private host path:

```sh
docker compose stop crm
docker compose run --rm --no-deps --entrypoint sh -v /absolute/private/path/known-good.sqlite:/restore.sqlite:ro crm -c 'cp /restore.sqlite /app/data/crm.sqlite && rm -f /app/data/crm.sqlite-wal /app/data/crm.sqlite-shm && chmod 600 /app/data/crm.sqlite'
docker compose up -d
```

Removing WAL/SHM files is appropriate only for this stopped-instance restore from a consistent backup. Never remove them from a running application. The backup includes users, so restore also restores accounts/session state; reset affected passwords if restoring after an account compromise.

## Updates

Before an update, take a backup. With the source package, replace only source/config files, retain `.env` and the Docker volume, then `docker compose up -d --build`. Do not run `docker compose down -v` on production: it removes the database volume.

Once a versioned GHCR image has been published, set `CRM_IMAGE` to the actual published tag and use:

```sh
docker compose pull
docker compose up -d --no-build
```

The archive does not imply a container tag exists. The operator must publish the image or build locally first. Registry authentication may be needed for private packages.

## Verification performed for this release

- TypeScript check and optimized UI build.
- Isolated service and HTTP tests, including authenticated mutations, CSRF/origin rejection, duplicate imports/retries, conflict detection, MIME handling, migration and SQLite backup/reopen.
- Full real-snapshot migration, row counts, foreign-key/integrity checks and representative search/list timing.
- Production dependency audit.

Docker builds, login and restart persistence are tested by GitHub Actions before image publication. Browser rendering has not been manually verified in the current build environment. The administrator should also test the two UI flows over the final HTTPS hostname before the team cuts over. The original hosted prototype remains separate.
