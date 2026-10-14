# Stage Force 0.1.5

## Searchable organisation picker

Email review now has one organisation field instead of a separate search box and native dropdown. Typing immediately opens filtered results; choosing a result displays its name. The search resets for each opened message, so text from a previous email cannot appear beside another suggested organisation.

Names, cities and primary email addresses can be searched. Arrow keys and Enter select; Escape closes. Editing the search clears the previous assignment until a result is explicitly chosen. Confirmation also waits for that selected organisation's details, preventing use of stale detail state. Out-of-order preview responses are ignored.

The existing batch picker accepts up to 10 `.eml` files, with individual confirmation and the existing 30-message/24-hour pending queue. No full-mailbox, clipboard or FastBill CSV importer was added.

## Keep local cleanup when deploying

New [deployment instructions](https://github.com/ProgRies/stageforce/blob/main/docs/deployment.md#move-local-work-to-the-server) describe moving the complete SQLite backup, including accounts and confirmed changes. No repeat spreadsheet import is needed.

## Update

```sh
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh the browser afterward. No schema migration from 0.1.3/0.1.4. Validation: existing automated service tests, TypeScript and production build; interactive browser testing remains outstanding.

The versioned image is available after successful release publication: `ghcr.io/progries/stageforce:0.1.5`.
