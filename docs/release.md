# Source-only GitHub and container publication

Canonical repository: https://github.com/ProgRies/stageforce.

`compose.local.yaml` builds the local source for testing. `compose.yaml` is the production file that pulls the pinned `ghcr.io/progries/stageforce:<version>` image; see [deployment.md](deployment.md) for server setup. Set `CRM_IMAGE` in `.env.example` to the version being released; CI checks that it matches `package.json`.

Keep the private initial-data archive in a completely separate location. No customer rows, email exports, database files or passwords belong in Git or the Docker build context.

`.gitignore` excludes databases, private data, exports, backups, `.env` and email files. `.dockerignore` allows only source and dependency files into the image. `scripts/check-source.mjs` checks tracked paths and common credential signatures before release. It complements manual review; it is not a general-purpose secret scanner.

## Checks

Every push to main and pull request runs `.github/workflows/ci.yml`: tests, type checking, UI build, source checks, Compose validation, Docker build and login/restart-persistence smoke test.

## Publish an image

A push to main that changes `package.json` or the release workflow starts a release. For later releases, update the version and release notes first.

Alternatively, in GitHub Actions, select **Build and publish**, then **Run workflow** on main. Alternatively, push a version tag matching `package.json`, such as `v0.1.12`. The workflow tests the code and container before publishing amd64/arm64 images and creating a GitHub release with the matching version tag. The versioned image, after successful publication, is `ghcr.io/progries/stageforce:0.1.12`.

It uses the repository workflow token with contents and packages write permissions. No production credentials or customer data are needed. A green CI check alone does not publish an image; the release workflow must finish successfully.

Releases publish only the immutable version tag; there is no `latest` tag. A server always runs the exact version its administrator chose, so a push to `main` alone never changes production. No automatic container updates run on the server: the administrator explicitly pulls and recreates the service.

After publication, set `CRM_IMAGE=ghcr.io/progries/stageforce:<version>` (the exact new version) in the server's `.env`, then run `docker compose pull` and `docker compose up -d --no-build`. Check package visibility in GitHub; private packages require registry authentication on the server. Use a new package version and release tag for subsequent releases rather than replacing an existing release version.
