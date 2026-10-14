# Stage Force 0.1.8

Historical spreadsheet entries stored as **Kontakt** now appear in the organisation's communication timeline and in email placement previews. They retain their original dates, wording and generic contact label; the app does not guess whether they were phone calls or emails.

This fixes a display regression from 0.1.7. No database migration, repeat import or contact-date rewrite is needed. Undated internal notes remain under **Mehr Details**. Recovering dates from spreadsheet revisions is a separate, private review process; no historical customer data is included in this release.

## Update

```sh
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh the browser afterward. 44 automated tests, type checking and the production build pass locally. Interactive browser verification remains outstanding. The versioned image is available after successful publication: `ghcr.io/progries/stageforce:0.1.8`.
