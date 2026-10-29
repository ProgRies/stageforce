# StageForce · 0.3.15

StageForce is our internal CRM for Stage clients. It has three parts that share one SQLite database:

- **The CRM** at `/`: organisations, contacts, the communication timeline, call lists, meetings, map pins, the Prüfen list and FastBill imports. Every open tab updates live when a colleague saves something.
- **The Chrome extension** in `integrations/chrome`: adds an **Add to StageForce** button to Gmail, so you save selected emails, contacts and meetings to the right organisation, and starts calls from Gmail.
- **The phone app** at `/m/`: a small iPhone web app for logging a call while it is still running.

Every account signs in with a password and an authenticator app. On the server, the CRM takes verified database snapshots on its own.

## Run it locally

With Docker Desktop running, open a terminal in this folder:

```sh
docker compose -f compose.local.yaml up -d --build
docker compose -f compose.local.yaml exec crm node server/cli.mjs user:add you@example.com "Your Name"
```

Use the Gmail address you will save emails from. Choose a password of at least 12 characters at the hidden prompt. Open http://localhost:3000 and sign in. On the first sign-in, scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, …), enter the six-digit code and store the ten recovery codes, which are shown only once. Later sign-ins ask for the current code.

The database starts empty and lives in the Docker volume, so it survives rebuilds. After changing source code, run the first command again.

There are two Compose files:

| File | Use |
| --- | --- |
| `compose.local.yaml` | Your computer. Builds this source and binds to `127.0.0.1:3000` only. |
| `compose.yaml` | The server. Pulls a published, pinned image and runs behind Traefik. See [deployment](docs/deployment.md). Do not use it locally. |

To type plain `docker compose …` locally, put `COMPOSE_FILE=compose.local.yaml` into a `.env` file in this folder (Git ignores it). Never copy that `.env` to the server.

### Start over with an empty local database

```sh
docker compose -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/backups/before-reset.sqlite   # optional
docker compose -f compose.local.yaml cp crm:/app/data/backups/before-reset.sqlite ./before-reset.sqlite          # optional, keeps a copy outside the volume
docker compose -f compose.local.yaml down -v
docker compose -f compose.local.yaml up -d --build
docker compose -f compose.local.yaml exec crm node server/cli.mjs user:add you@example.com "Your Name"
```

`down -v` deletes the volume with the database. Use it only when you mean to. Afterwards, create a new extension key in the CRM and reconnect the extension.

## Connect the Chrome extension

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `integrations/chrome`.
2. In the CRM: gear → **Browser-Erweiterung verbinden** → **Schlüssel erstellen**. Confirm with a fresh authenticator code and copy the key.
3. Click the extension's toolbar icon, enter the CRM address (`http://localhost:3000` locally) and the key, then click **Connect**.
4. Reload Gmail, open an email and click **Add to StageForce**.

Details: [Browser extension](docs/extension-setup.md).

## Documentation

| Page | For |
| --- | --- |
| [User guide](docs/user-guide.md) | Working in the CRM: organisations, timeline, calls and the call card, call lists, meetings, map, Prüfen, settings |
| [Browser extension](docs/extension-setup.md) | Installing, pairing, saving emails and meetings from Gmail, what is sent |
| [Phone app](docs/mobile-app.md) | Installing `/m/` on an iPhone and testing it from your Mac |
| [FastBill import](docs/fastbill-import.md) | Adding FastBill customers one row at a time |
| [Deployment](docs/deployment.md) | Server setup, accounts, two-factor resets, snapshots, backups and updates |
| [Releases](docs/release.md) | How an image is published |
| [Database](docs/schema.md) | Tables and schema version |
| [Release notes](docs/release-notes.md) | What changed in each version |

## Development

Without Docker you need Node 24.14 or newer within the 24.x line:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
APP_URL=http://localhost:3000 node server/http.mjs
```

After changing the extension, click its reload button in `chrome://extensions` and reload Gmail.

All work happens on `main`. Each change gets a short-lived branch and a pull request into `main`; test it locally with `compose.local.yaml`. Merging a change does not touch the server. Only a version change merged into `main` builds and publishes `ghcr.io/progries/stageforce:<version>` (see [Releases](docs/release.md)).

Current versions: CRM 0.3.15, extension 0.4.21, database schema 13. Startup migrates older databases automatically; back up first, because older versions cannot open a newer schema.

No real customer data, mailbox contents, passwords or keys belong in this repository.
