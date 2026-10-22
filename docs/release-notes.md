# StageForce 0.3.1-local / extension 0.4.1

- Light, dark and system themes cover phone controls, note fields and settings.
- Extension popups follow the signed-in CRM user’s theme, with matching surfaces and static gradients.
- Add Note creates an internal note; call events use the contact phone controls.
- Schema 8 stores per-user theme preferences and preserves existing data.

# StageForce 0.3.0-local / extension 0.4.0

- Durable saved-email badges and read-only reopening from SQLite.
- 75/25 popup, bounded initial email preview, keyboard isolation.
- Signature phone suggestions and attachment metadata references.
- Click-to-dial with notes in the CRM and extension; organisation/contact saved before dialling; cancel preserves them without a call event.
- Schema 7 preserves existing users, keys and CRM records.
- 57 automated tests, typecheck, build and Chromium fixture checks pass. Live Gmail, Docker Desktop and Mac/iPhone calling require a local check.

See [Update instructions](update-local.md).

# StageForce 0.2.0-local

Local development version; not published or deployed.

- Chrome extension v0.3.0: lighter, simplified two-column popup; actual organisation search, conservative automatic matching, contact selection and optional organisation links.
- Personal revocable keys; localhost testing and later HTTPS hosting; matching sends headers only, Save sends message text.
- One atomic save for the email and related records; repeat-save protection.
- Existing CRM interface and SQLite records retained. Connection settings now pair the browser extension.
- Gmail Apps Script implementation, endpoints and installation instructions removed.
- Schema 6 adds extension credentials and drops obsolete Gmail add-on credentials. Back up before using any existing database; older binaries cannot open schema 6. Rollback requires the previous database backup.

Start with [local setup](extension-setup.md). Production data is not included.
