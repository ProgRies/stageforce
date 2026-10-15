# Stage Force 0.1.11

Production deployment now defaults to `ghcr.io/progries/stageforce:latest`. Releases from `main` publish both `latest` and their version tag for amd64 and arm64 after tests and container smoke checks pass. Historical tag builds do not move `latest`.

The complete production Compose configuration includes persistent storage, health checks, bounded logs and configurable Traefik settings for `stageforce.jaimo.me`. Local Compose continues to build from source and keeps its separate database.

No application behavior or database schema changes; no repeat import is needed.

## Production update

Keep your existing `.env` and database volume. On the server, ensure `.env` contains `CRM_HOST=stageforce.jaimo.me` and `CRM_IMAGE=ghcr.io/progries/stageforce:latest`. On a fresh installation only, copy `.env.example` to `.env` and review the Traefik settings. Back up an existing database before updating.

```sh
git pull --ff-only
docker compose pull
docker compose up -d
```

## Mac local update

For the existing `stageforce-real` instance:

```sh
git pull --ff-only
docker compose -p stageforce-real -f compose.local.yaml up -d --build
```

Use the same project name as before to retain your database. See [deployment instructions](deployment.md) for server accounts, data transfer and Gmail pairing.
