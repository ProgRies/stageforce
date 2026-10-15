# Stage Force 0.1.12

Review and save selected emails directly in the Gmail sidebar: confirm or find/create an organisation, select its contacts, check message text and timeline placement, then explicitly save. Stage-purple primary actions keep the native cards simple. Google's card interface does not support custom glass backgrounds.

The same parser, conservative quote cleanup, duplicate detection, atomic save and conflict checks power both Gmail and the existing browser reviewer. Long text previews are paginated without truncating stored content. After saving, a link opens the organisation in the CRM. No new Gmail permissions, background scans, AI processing, sending or mailbox writes.

## Update

Back up the database before deployment. On the server:

```sh
docker compose exec crm node server/cli.mjs backup /app/data/backups/before-0.1.12.sqlite
docker compose cp crm:/app/data/backups/before-0.1.12.sqlite ./before-0.1.12.sqlite
git pull --ff-only
docker compose pull
docker compose up -d
```

Use `CRM_IMAGE=ghcr.io/progries/stageforce:latest` or `:0.1.12`. Startup applies schema 5 automatically. Do not repeat the original import. A rollback to an older version requires the matching database backup.

In Apps Script replace `Code.gs` with the current repository version, retain `CRM_ORIGIN='https://stageforce.jaimo.me'`, save and reload Gmail. Keep the existing manifest and its configured hostname. In the hosted CRM, renew your Gmail connection key; remove the old connection in the sidebar and connect with the replacement. Old keys remain capture-only and continue to offer the browser review path. See [Gmail setup](gmail-setup.md).

Automated tests cover scope isolation, legacy key preservation, ownership/expiry, duplicates/retries, organisation conflicts, selected contacts, full text preservation, date placement and the three-step Apps Script flow. A live Workspace/sidebar visual check remains necessary after deployment; Google services are mocked in automated tests.
