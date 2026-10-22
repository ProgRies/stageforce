# StageForce: later hosting and backups

This package defaults to local development. The default Compose file builds your local source; it does not pull a previous published release. For today, use [local setup](extension-setup.md).

## Later shared hosting

Use the same StageForce application and SQLite database on one server, with one application instance and a persistent volume on local disk. The web UI and extension API belong to that same service.

Prepare a separate production Compose configuration before deploying:

- Build the reviewed source into a pinned image.
- Set `NODE_ENV=production`, `APP_URL=https://<your-crm-host>` and the persistent `DATA_DIR`.
- Put the service behind your HTTPS reverse proxy with a valid certificate. Do not expose the development port publicly.
- Route `/api/integrations/extension` to the application. It authenticates a personal bearer key, not Google credentials or a browser-only proxy login.
- Never log request bodies or Authorization headers. Restrict server access and encrypt the host disk and backups.
- Create individual users. Every active CRM user currently has team-wide read/edit access; there are no per-organisation access rules.
- Pair each extension with the hosted CRM address and a key issued by that CRM.

No production configuration has been deployed by this work. Test TLS, the reverse proxy and the real installed extension before using confidential production email.

## Backup

For the local default Compose configuration:

```sh
docker compose exec crm node server/cli.mjs backup /app/data/backups/crm.sqlite
docker compose cp crm:/app/data/backups/crm.sqlite ./crm-backup.sqlite
```

The CLI uses SQLite's consistent online backup API. A backup contains CRM data and account/session/key state; protect it accordingly. Do not copy only the main file from a running SQLite database because uncheckpointed writes can be in the WAL.

To move data later, back up the local instance, stop the destination instance, preserve its current database, restore the consistent backup into its data directory with the container user's ownership and restricted permissions, then start the new instance. Verify accounts and selected records before allowing team writes. Do not repeat the initial spreadsheet import after restoring a database.

Rollback after a schema upgrade requires the matching pre-upgrade database backup. Removing stale WAL/SHM files is appropriate only during a stopped-instance restore, never while the app is running.

## Accounts

```sh
docker compose exec crm node server/cli.mjs user:add colleague@example.com "Colleague"
docker compose exec crm node server/cli.mjs user:password colleague@example.com
docker compose exec crm node server/cli.mjs user:disable colleague@example.com
```

Passwords are entered at a hidden prompt and hashed with scrypt. Password reset and account disabling revoke sessions and extension keys. Session expiry is seven days; extension key expiry is 90 days. The current design uses one active extension key per CRM user.
