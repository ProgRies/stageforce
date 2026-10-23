# StageForce · 0.3.6-local

Two parts: **StageForce**, the web interface and internal API for SQLite, and the **Chrome extension**, which imports selected Gmail emails. Everything in this package is for local development. Nothing has been published or deployed.

## Start

With Docker Desktop running, open a terminal in this folder:

```sh
docker compose up -d --build
docker compose exec crm node server/cli.mjs user:add ries@jaimo-solutions.com "Christian Ries"
```

Use the Gmail address you will import from. Choose a password of at least 12 characters at the hidden prompt. Open http://localhost:3000 and sign in. Your database starts empty and persists across rebuilds.

The default `compose.yaml` and `compose.local.yaml` both build the local source and bind to localhost. Never run `down -v` unless you intend to delete your local database.

## Connect Gmail

1. Open `chrome://extensions`, enable Developer mode, and **Load unpacked** → `integrations/chrome`.
2. In StageForce: gear → **Browser-Erweiterung verbinden** → **Schlüssel erstellen**.
3. Click the extension toolbar icon. Enter `http://localhost:3000` and your personal key; click **Connect**.
4. Refresh Gmail. Open an email → **Add to StageForce** → **Save & Continue**.

A clear existing contact match is prefilled. Ambiguous matches and new organisations require your choice. **Save & Open** opens that organisation in the CRM. Each colleague uses their own account/key. The former Gmail add-on is removed.

[Detailed setup, security and extraction limits](docs/extension-setup.md)

## CRM features retained

Organisation/contact editing, search, communication history, follow-ups, call queues, review categories, FastBill imports and the optional .eml file importer. The browser extension uses the same database; it does not need the file importer. No real CRM snapshot, mailbox contents, passwords or connection keys are included.

## Development

Requires Node 24.14+ within the 24.x line if running without Docker:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
APP_URL=http://localhost:3000 node server/http.mjs
```

After source edits, rebuild Docker with `docker compose up -d --build`. For extension edits, click Reload in `chrome://extensions` and refresh Gmail.

Schema 8 adds per-user theme preferences alongside durable email identities and call preparation/logging. Existing CRM data and credentials are preserved. Back up the database before upgrading; older versions cannot open schema 8. The extension starts at v0.4.6; CRM version is 0.3.6-local.

[Future hosting and backups](docs/deployment.md) · [Schema](docs/schema.md) · [Release notes](docs/release-notes.md)

See [Update instructions and feature details](docs/update-local.md) for this release.
