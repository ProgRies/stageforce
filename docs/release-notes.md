# StageForce 0.3.3-local

- Organisation header contains the immediately saved Lead / Kunde / Partner / Agentur selector and editable FastBill link.
- Right column contains Gmail search, contacts, links and one general notes field with Save.
- Note drafts are retained in the current browser tab across organisation changes and reloads; save explicitly to share with colleagues. Concurrent note edits require review before overwriting.
- Add Note creates a dated timeline event alongside calls and emails; existing Notiz events also appear there. General notes edits stay in the change log.
- Existing next-step and review text remains available under Changes & Sources below the timeline.

# StageForce 0.3.2-local / extension 0.4.2

- Narrower navigation with compact spacing and visible labels.
- Create organisations from search results through a themed form with existing-name matching.
- Search and refresh shortcuts in the toolbar.
- Phone sections appear in the extension only when a number is detected or stored in the CRM.

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
