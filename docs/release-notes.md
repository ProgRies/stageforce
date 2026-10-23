## 0.3.6-local · extension 0.4.5

- Gmail buttons distinguish saved mail (green), connection issues (amber), and messages ready to import (a brief StageForce shimmer). Click and save animations respect reduced-motion preferences.
- Disconnected buttons open connection settings; connection warnings retry when returning to Gmail or coming online.
- CRM shows the two contacts with the latest recorded email/call in this organization, with alphabetical fallback. Expand the remaining contacts when needed. An active call or contact edit prevents collapsing its controls.

## 0.3.5-local · extension 0.4.4

- Chrome toolbar and extension management use the StageForce client logo in native icon sizes.
- Organization list previews show Lead, Kunde and Partner / Agentur, including any retained legacy status.
- Added security boundary regression coverage for cookie flags, CSRF, authentication, request size, static-file isolation and SQL-like inputs.

# StageForce 0.3.4-local / extension 0.4.3

- Collapsible desktop navigation keeps the logo, icons and hover labels. Width and label transitions respect reduced motion; the chosen state is remembered.
- Tighter organisation list hides the unknown-type placeholder. Status dropdown arrow is inset.
- Extension search results overlay the form so suggestions do not move the email preview.
- Contact names fall back to readable email usernames, including shared addresses. Existing entered names remain preferred; suggested names can be edited.
- Contact editing no longer asks for a primary contact. Existing legacy selections remain stored.

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
