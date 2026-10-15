# Stage Force 0.1.9

- Connected timeline cards for emails and calls, newest first. Historical generic **Kontakt** entries keep their original wording and dates.
- Inline call entry, contact editing and organisation linking.
- Visible right-hand fields for status, phase, owner, follow-up, summary, FastBill URL and review notes. Explicit save, unsaved-edit warnings and version checks protect changes. Missing expected FastBill links are highlighted.
- **In Gmail suchen** opens an organisation/contact search in a new tab for the current CRM account. No email access or changes.
- Top-right question mark opens a guided spotlight tour, with keyboard navigation and Escape to close.
- Gmail add-on capture and the three-step email reviewer remain compatible. No database schema change or repeat import.

## Update

Run these commands separately in your Stage Force folder:

```powershell
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Only run the second command if the pull succeeded. Refresh the browser afterward. Existing Docker volumes and data remain in place; do not run `down -v`.

47 automated tests, type checking and the production build pass locally. The Gmail adapter and HTTP review flow are covered with mocked Google services and synthetic data. Interactive browser QA and a live Workspace add-on test remain outstanding. The versioned image becomes available after successful publication: `ghcr.io/progries/stageforce:0.1.9`.
