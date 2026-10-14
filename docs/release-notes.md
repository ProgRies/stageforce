# Stage Force 0.1.0

First self-hosted release: a shared SQLite CRM with individual accounts, organisation and contact editing, linked entities, search, call queues, activity history, FastBill client links and human-reviewed incoming/outgoing `.eml` imports.

The interface uses the Stage blue-purple-pink palette and three-line logo. No AI or mailbox access is required; the application cannot send email.

## Deployment

Container: `ghcr.io/progries/stageforce:0.1.0` (amd64 and arm64).

Use the included Compose setup behind your existing Traefik. Set `CRM_HOST` and `CRM_IMAGE` in `.env`; run `docker compose pull` and `docker compose up -d --no-build`. Package visibility is managed separately in GitHub; private packages require registry authentication. Building locally with `docker compose up -d --build` is also supported.

Create the first account from the server terminal with `docker compose exec crm node server/cli.mjs user:add EMAIL "NAME"`. The hidden prompt requires a password of at least 12 characters. There is no public sign-up.

The initial CRM snapshot is a separate private file, imported once through the CLI as described in the README. This release contains no customer data, passwords or database. Individual email imports are available in the browser after login.

Run one application instance with persistent local storage. Configure backups before using production data. Test both the record-update and call-queue flows through your final HTTPS hostname before team cutover.
