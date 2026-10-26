# StageForce: later hosting and backups

This package defaults to local development. The default Compose file builds your local source; it does not pull a previous published release. For today, use [local setup](extension-setup.md).

## Later shared hosting

Use the same StageForce application and SQLite database on one server, with one application instance and a persistent volume on local disk. The web UI and extension API belong to that same service.

Prepare a separate production Compose configuration before deploying:

- Build the reviewed source into a pinned image, and set `CRM_IMAGE` to its exact version. Never deploy a moving tag such as `latest`.
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
docker compose exec crm node server/cli.mjs user:mfa-reset colleague@example.com
docker compose exec crm node server/cli.mjs user:list
```

Passwords are entered at a hidden prompt and hashed with scrypt. Password reset and account disabling revoke sessions and extension keys. Session expiry is seven days; extension key expiry is 90 days. The current design uses one active extension key per CRM user.

Every sign-in needs a TOTP code from an authenticator app (or a single-use recovery code). New users set the app up on their first sign-in; they cannot reach the CRM before that. If a phone is lost and the recovery codes are gone, `user:mfa-reset` removes the old authenticator, ends the user's sessions and revokes their extension key; the next sign-in sets up a new app. Check identity out of band before resetting, because the reset leaves the password as the only factor until the user enrols again. `user:list` shows who has set up the app and how many recovery codes are left.

Creating a browser-extension key asks for a fresh authenticator code, because the key signs the extension in for 90 days without one.

Sign-in limits: 30 attempts per client address and 10 per account and address within ten minutes, and 50 per account within an hour. There is no team-wide limit, so one address cannot lock everybody out.

```sh
docker compose exec crm node server/cli.mjs security:log                       # latest 50 events
docker compose exec crm node server/cli.mjs security:log colleague@example.com 100
```

Security events (sign-ins, wrong passwords and codes, recovery-code use, MFA set-up and resets, browser keys created or revoked, CLI account changes) are kept for 90 days with time, account and client address. Each user sees their own under Einstellungen → Anmeldeaktivität, and the first screen after signing in warns about wrong passwords or codes since their previous sign-in.

## GitHub account and repository

Whoever can push to `main` and publish a release controls what the server can run. Turn on two-factor authentication for every account with write access, and protect `main` (Settings → Branches: require a pull request before merging, block force pushes and deletion).
