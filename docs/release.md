# Releases

Canonical repository: https://github.com/ProgRies/stageforce.

All work goes into `main` through short-lived branches and pull requests, tested locally with `compose.local.yaml`. A release is a merge into `main` that raises the version in `package.json`; other merges publish nothing. The server only ever runs a published, pinned image through `compose.yaml`; see [deployment.md](deployment.md).

## Before a release

1. Raise `version` in `package.json` and in `package-lock.json`.
2. Set `CRM_IMAGE` in `.env.example` to the same version; CI checks that they match.
3. Add the changes at the top of [release-notes.md](release-notes.md). The GitHub release uses this file as its text.
4. Update the version line in the README if the extension or schema changed too.

## Checks

Every push to `main` and every pull request runs `.github/workflows/ci.yml`: tests, type checking, UI build, source checks, Compose validation, Docker build and a login and restart-persistence smoke test of the container.

`scripts/check-source.mjs` checks that only expected paths are tracked and looks for common credential patterns. `.gitignore` keeps databases, backups, exports, email files and `.env` out of Git, and `.dockerignore` lets only source and dependency files into the image. No customer data, database files or passwords belong in the repository or the build context.

## Publish an image

The workflow **Build and publish** (`.github/workflows/release.yml`) runs when a push to `main` changes `package.json`, the release workflow or the container smoke test. It can also be started by hand (Actions → Build and publish → Run workflow on `main`) or by pushing a tag such as `v0.3.13` that matches `package.json`.

It tests the code and the container, publishes amd64 and arm64 images as `ghcr.io/progries/stageforce:<version>` and creates the GitHub release `v<version>`. It uses the repository's workflow token; no server credentials or customer data are involved. A green CI check alone does not publish anything.

Only the exact version tag is published; there is no `latest`. Nothing updates the server on its own: the administrator sets `CRM_IMAGE` to the new version in the server's `.env` and runs `docker compose pull` and `docker compose up -d` (see [Updates](deployment.md#updates)). Never republish an existing version; use a new one.

If the package is private, the server needs `docker login ghcr.io` with a token that has `read:packages`.
