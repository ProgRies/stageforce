# StageForce · 0.3.10-local

Two parts: **StageForce**, the web interface and internal API for SQLite, and the **Chrome extension**, which imports selected Gmail emails. Everything in this package is for local development. Nothing has been published or deployed.

## Start

With Docker Desktop running, open a terminal in this folder:

```sh
docker compose up -d --build
docker compose exec crm node server/cli.mjs user:add you@example.com "Your Name"
```

Use the Gmail address you will import from. Choose a password of at least 12 characters at the hidden prompt. Open http://localhost:3000 and sign in. Your database starts empty and persists across rebuilds.

`compose.yaml` builds the local source and binds to localhost. Never run `down -v` unless you intend to delete your local database.

## Reset your local database

Rebuilding the image keeps your data: the database lives in the Docker volume, not in the image. To start over with an empty database:

```sh
docker compose exec crm node server/cli.mjs backup /app/data/backups/before-reset.sqlite   # optional
docker compose cp crm:/app/data/backups/before-reset.sqlite ./before-reset.sqlite          # optional, keeps the backup outside the volume
docker compose down -v
docker compose up -d --build
docker compose exec crm node server/cli.mjs user:add you@example.com "Your Name"
```

Then create a new key in StageForce settings and reconnect the browser extension. The old key no longer exists.

## Connect Gmail

1. Open `chrome://extensions`, enable Developer mode, and **Load unpacked** → `integrations/chrome`.
2. In StageForce: gear → **Browser-Erweiterung verbinden** → **Schlüssel erstellen**.
3. Click the extension toolbar icon. Enter `http://localhost:3000` and your personal key; click **Connect**.
4. Refresh Gmail. Open an email → **Add to StageForce** → **Save & Continue**.

A clear existing contact match is prefilled. Ambiguous matches and new organisations require your choice. **Save & Open** opens that organisation in the CRM. Each colleague uses their own account/key. The former Gmail add-on is removed.

[Detailed setup, security and extraction limits](docs/extension-setup.md)

## CRM features retained

Organisation/contact editing, search, communication history with notes and meetings, follow-ups, personal call lists with one-tap call results, the Prüfen handoff list, FastBill imports and the optional .eml file importer. The browser extension uses the same database; it does not need the file importer. No real CRM snapshot, mailbox contents, passwords or connection keys are included.

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

The database is at schema 9 (personal call lists; see [Schema](docs/schema.md)). Existing CRM data and credentials are preserved on upgrade. Back up the database before upgrading; older versions cannot open schema 9. The extension is v0.4.15; CRM version is 0.3.10-local.

[Future hosting and backups](docs/deployment.md) · [Schema](docs/schema.md) · [Release notes](docs/release-notes.md)

See [Update instructions and feature details](docs/update-local.md) for this release.
