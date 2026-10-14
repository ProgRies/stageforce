# Stage Force 0.1.1

## Appearance and layout

- Light/dark toggle on the login screen and in the CRM header, remembered per browser and synchronized across tabs.
- Dark glass panels over a slowly moving purple/deep-blue gradient with faint mathematical equations.
- Background animation can be paused; reduced-motion preferences disable it automatically.
- Larger text, controls and list rows at 100% zoom, with reduced outer margins and a full-width desktop layout.
- Dark styles cover editing, contacts, links, call queues, email review, warnings and dialogs.

## Update

Container: `ghcr.io/progries/stageforce:0.1.1` (amd64 and arm64).

For an existing local checkout:

```sh
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh the browser. Existing accounts and imported data stay in the same Docker volume; no migration or account recreation is needed. Do not remove the volume.

For production, set `CRM_IMAGE=ghcr.io/progries/stageforce:0.1.1` in `.env`, then run `docker compose pull` and `docker compose up -d --no-build`.

There are no database or mailbox-integration changes in this release. Browser rendering has not been manually verified in the build environment; verify the appearance at your preferred screen size after updating.
