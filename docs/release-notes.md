# Stage Force 0.1.7

Email review now uses three steps for both Gmail and `.eml`: organisation, contacts, and chronological placement. Confirm a suggested organisation with **Stimmt**, or create a new Lead inside the wizard. Select multiple contacts with checkboxes. Preview the email between neighbouring events, then save everything together.

Organisation pages now focus on name, Kunde/Lead status and a newest-first email/call timeline. Contacts and supporting details live in a compact right-hand column. Emails expand on click; calls have a small reached/not-reached form with optional notes and follow-up. Internal notes and edit history remain available under **Mehr Details**.

Kunde means confirmed obligation to pay. Free usage and agency status do not automatically qualify. Historical unclear/former statuses are retained and flagged for human review. [Workflow details](https://github.com/ProgRies/stageforce/blob/main/docs/email-wizard.md).

## Update

Back up first:

```sh
docker compose -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/backups/before-0.1.7.sqlite
```

Then update and rebuild:

```sh
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh your browser. Schema 4 adds one table automatically; no repeat spreadsheet import. An older app needs the pre-upgrade backup to roll back. No email-writing functionality has been introduced.

43 automated tests, type checking and production build pass locally. Interactive browser verification remains outstanding. The versioned image is available only after successful publication: `ghcr.io/progries/stageforce:0.1.7`.
