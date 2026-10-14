# Stage Force 0.1.3

## Cleaner controls

A compact gear in the top right contains appearance/system mode, animation pause, connection status and refresh. The organisation add button stays outside, before the gear. Disclosure arrows now sit beside contact counts and section labels.

## Gmail capture and human review

A private Google Workspace add-on reads the selected message after an explicit click and transfers its text/headers into the signed-in owner's review queue. Attachments stay in Gmail. The add-on cannot send, draft, forward or modify emails. Nothing updates the business record until a human confirms in the CRM. Sent replies can be captured separately.

Per-user import-only keys can be created, renewed or revoked in settings. Keys expire after 90 days, are hashed in SQLite and cannot access CRM records. Pending reviews expire after 24 hours, require the matching account and deduplicate retries. The existing `.eml` workflow remains available.

Installation requires a publicly reachable HTTPS CRM and a one-time Apps Script test deployment; Google cannot send to your computer's localhost. See [Gmail setup](https://github.com/ProgRies/stageforce/blob/main/docs/gmail-setup.md).

## Update

Back up before upgrading. Schema version 2 adds only the integration-key table; it applies automatically and retains existing data/accounts. No spreadsheet reimport is needed. Downgrading requires restoring the pre-upgrade backup.

```sh
docker compose -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/before-0.1.3.sqlite
docker compose -f compose.local.yaml cp crm:/app/data/before-0.1.3.sqlite ./before-0.1.3.sqlite
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh the browser after rebuilding. The versioned production image is published only if the release workflow succeeds: `ghcr.io/progries/stageforce:0.1.3`.

Validation: automated service/security tests, mocked Apps Script adapter, additive upgrade preservation, TypeScript and production UI build. Browser visuals and live Gmail installation/delivery have not been tested in the build environment.
