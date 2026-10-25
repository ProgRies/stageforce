## 0.3.9-local

## Unreleased · extension 0.4.13

Better contact and phone extraction in the Gmail popup. Reload the extension and refresh Gmail; rebuild the CRM for the role field. No database migration is required.

- Read German signature labels (T, M, Tel., Mob., Handy, Büro, Zentrale, Durchwahl) and split "Tel. … | Fax … | Mobil …" lines, dropping only the fax entry. Dates are no longer taken as phone numbers.
- Suggest sender phones from the signature block only, not from numbers mentioned in the text.
- Mark suggested numbers as "new" with an × to drop them before saving the email.
- Keep table cells apart in email text, so contact-form emails stay readable and their addresses parse correctly.
- Extract contact recognises titles, combines first and last name fields, skips company lines, and suggests role and company. The role is saved for new contacts; the company prefills the organisation search when none is selected.
- Send recipients' display names, so new contacts from To/Cc get real names.
- Ctrl/Cmd+Enter saves and continues, or saves the open contact editor.

## 0.3.10-local · extension 0.4.12

Centered the collapsed sidebar logo and placed organisation status below the name. Contact editing uses inset icons and accessible field names. The popup shows connection settings only while disconnected and no longer offers a manual animation pause control; system reduced-motion settings remain respected.

Rebuild the CRM, reload the extension and refresh Gmail. No database migration is required.

- Edit call notes and notes directly in their timeline cards. Preserve event dates, authors and contact links; audit edits and reject conflicting changes.
- Toggle a contact pencil to an X. Closing discards its draft; saving updates the card and collapses its editor without clearing the timeline or loaded older activities.
- Use StageForce confirmation dialogs inside the CRM, and the organisation creation form in FastBill imports. Browser tab-close protection still applies to unsaved work.
- Keep StageForce call buttons white in the header, contacts and expanded call cards. Timeline colors remain blue for emails, purple for calls and amber for notes in both themes.
- Include the shared contact parser in the Docker build stage and context.

Rebuild the CRM and refresh its browser tab. Extension 0.4.11 is unchanged. No database migration is required.

## 0.3.8-local · extension 0.4.11

- Edit contact names and phone numbers with the pencil in Gmail, including on already imported emails. Saving a contact writes it to the selected organisation independently of importing the email.
- Highlight contact details in an email and choose Extract contact / Kontakt extrahieren. Parsing happens locally; review the suggestion and save a new contact or enrich an existing one. Extracted contacts can be linked without changing the original sender or recipients.
- Expand CRM contact editors directly inside their cards, with single-line email and phone inputs. Separate multiple values with semicolons.
- Place a white StageForce quick-call control beside Notiz hinzufügen. It uses the first valid number of the most recently contacted person with a number, falling back to contact order. Calling and call notes use the existing flow.
- Keep expanded timeline entries open when refreshing contacts. Validate contact and email organisation associations before saving.

Rebuild the CRM and reload the extension for this update. No database migration is required.

## Extension 0.4.10

- Use a compact 1200px popup with a 70/30 desktop split and a stacked layout on small screens.
- Close by clicking outside the popup; pending call notes retain their discard confirmation, and saves in progress stay open.
- Bring the CRM’s blue/purple signal background into dark-mode popups using a bounded 20fps canvas, with pause, reduced-motion and hidden-tab handling. Dispose the renderer when the popup closes.

## Extension 0.4.9

- Keep Gmail header buttons visually identical in light and dark mode.
- Use a white-to-mint gradient, dark text and a green checkmark for saved emails.

## Extension 0.4.8

- Give saved-email buttons a bright green outline, neutral background and lightning emoji in light and dark mode.

## 0.3.7-local · extension 0.4.7

- Inset the message-direction arrow in the Gmail popup.
- Standardize CRM dropdown spacing across forms, appearance settings, call queues and imports, preserving the organisation status control.
- Match arrow colors to light/dark themes and retain native arrows in forced-colors mode.

## Extension 0.4.6 · CRM 0.3.6-local

- Failed authentication or connection checks disable email saving and show a retry action while preserving the draft.
- Save success requires an explicit CRM acknowledgement; missing or malformed responses cannot mark an email as saved.
- Worker reloads preserve an existing pairing. After reloading the extension, refresh Gmail to replace its old content-script context.

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
