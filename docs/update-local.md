# Local update: CRM 0.3.9 / extension 0.4.11

## Install over your existing local project

Keep the same StageForce directory and Compose project so Docker reuses your database volume.

1. With the existing container running, back up SQLite and copy the backup to your Mac:

   ```sh
   docker compose exec crm node server/cli.mjs backup /app/data/before-0.3.9.sqlite
   docker compose cp crm:/app/data/before-0.3.9.sqlite ./before-0.3.9.sqlite
   ```

2. In your existing repository on `local-development`, run `git pull --ff-only`. Preserve your `.env`, local backups and data. Do not delete the Docker volume or use `docker compose down -v`.
3. From your existing StageForce directory:

   ```sh
   docker compose up -d --build
   docker compose logs --tail=30 crm
   ```

4. Open http://localhost:3000 and refresh. Existing users, API keys and data remain. Schema 8 migrates automatically.
5. This CRM update leaves extension 0.4.11 unchanged. If upgrading from an older extension, in `chrome://extensions`, reload Stage Force. If Chrome was loading a different directory, use Load unpacked and select the updated `StageForce/integrations/chrome` folder. Refresh Gmail. Packing a CRX is unnecessary.

## What changed

- Calls and notes have a pencil for editing their text in place. The original date, author and linked contact stay intact; edits are audited.
- The contact pencil becomes an X that closes the editor. Saving updates and collapses it without clearing the timeline.
- CRM confirmation prompts use the app styling. All CRM call buttons use the white StageForce style.
- Timeline cards distinguish blue emails, purple calls and amber notes.

### Earlier contact-extraction update

- Rebuild Docker and reload the extension together for contact editing and selection extraction.
- Use the contact pencil to correct a name or add/change phone numbers. Save contact writes immediately to the selected organisation; saving the email remains a separate action. Existing secondary email addresses and roles are preserved in extension edits.
- Highlight a single person’s contact details in the email body, then choose Extract contact (extension) or Kontakt extrahieren (CRM). Review before saving; choose an existing contact to add details to it. Selection parsing is local and may need correction, especially when several people appear in the selection.
- CRM contact forms expand inside their cards. Email and phone inputs take one line; use semicolons for additional values.
- The white quick-call control beside Notiz hinzufügen chooses the first usable number of the most recently contacted person with a number. Other numbers remain on the contact cards.

- The extension popup uses a compact 70/30 desktop split. Click outside to close; pending call notes still ask before discarding, and saving cannot be interrupted.
- Dark popups use the CRM signal background with a pause control. Animation respects reduced motion, pauses in hidden tabs and stops when the popup closes.

- Dropdown arrows use consistent inset spacing in the extension and CRM, including light, dark and high-contrast modes.

- Use the sidebar toggle above logout to collapse or expand navigation on desktop. The logo and navigation icons stay visible.
- The narrower organisation list displays a known location or organisation type; the Unklar placeholder is hidden.
- Email-based contact names are suggested when a name is missing (paul.schubert → Paul Schubert, socialmedia → Socialmedia). No primary-contact selection is required.
- Organisation suggestions overlay the extension form without shifting its contents.

- Status beside the organisation name saves immediately. The FastBill button and its edit pencil sit above Gmail search.
- General notes use a single growing text field and Save. Unsaved drafts remain in this browser tab across navigation/reload, scoped to your account and organisation. Closing the tab can lose an unsaved draft; Save writes to the shared CRM.
- Add Note creates a dated timeline event alongside calls and emails, independently of general organisation notes.

- Compact navigation leaves more room for organisation details. Search and refresh are available in the top toolbar.
- Create an organisation from the search results. The in-app form starts with your search text, suggests existing organisations, and opens the saved record.
- Contacts without detected or stored phone numbers show no phone section in the extension. Use the pencil to add a missing number or correct an existing one.

- Choose Hell, Dunkel or System in CRM settings. The extension reads this account preference each time its popup opens; System follows the browser’s OS theme live. Static gradients, borders and shadows replace backdrop blur.
- “Notiz hinzufügen” adds a timeline note without recording a call or changing the last-contact date. Use the contact’s phone button to start and record calls.

- A compact 70/30 desktop popup, stacked on narrow screens.
- Email text is extracted once per preview; large bodies initially render only 6,000 characters. Full text is retained and saved, including loaded conversation history. Use “Show / edit full email” to edit longer messages.
- Keyboard events inside the popup are isolated from Gmail's document shortcuts.
- Saved badges are checked against SQLite, scoped to mailbox plus Gmail message identifier. Opening a saved message shows its stored CRM content, selected contacts and current phone numbers. Message content stays read-only; contacts can be edited with the pencil, and calling and Open in CRM remain available.
- Older imports use a SHA-256 fingerprint of original sender, date text, subject and body. Only that digest is sent during background fallback checks. A match attaches the Gmail identifier. A changed original rendering/date text may prevent recognition of older records; do not assume a missing badge proves an old import is absent. New records retain their Gmail identity.
- Phone suggestions use the current sender's non-quoted signature and telephone links. Fax, generic numeric text and recognized quoted reply sections are excluded. You can correct suggested numbers before importing. Automatic import suggestions append numbers. An explicit pencil edit replaces the phone list with the reviewed values; uncertain ownership still requires review. Unknown country codes are not guessed.
- Attachment cards supply filename, displayed size and type when available. No file bytes are fetched or stored. Signature images and prose mentions are not treated as attachment evidence. Detection depends on Gmail's loaded DOM; collapsed/unloaded or unfamiliar attachment layouts may be missed.

## Calling

Every contact phone control has a phone icon, number and StageForce mark. Clicking it first ensures the organisation/contact/number exist, then opens a `tel:` link using the configured calling app. The browser/OS may require another confirmation; the expanded note includes a direct “Open calling app again” link if needed. Mac/iPhone Continuity must already be configured on the user's devices.

In the extension, a missing organisation causes the button to shake and points to the organisation field. Choose an existing organisation, choose Create, or type a new organisation name before calling. A typed exact existing name is reused. The organisation, contact and number remain saved even if no call event is recorded. Starting a call does not import the email.

Save records the original click timestamp, the user, contact, number, organisation and notes. Empty notes produce “Anruf gestartet · keine Notiz”. This records an attempt to open the dialler, not proof of a connected call, and does not advance the organisation's last successful contact date. Save retries do not duplicate the event.

× cancels the pending call note and deletes its preparation record; the saved organisation and contact remain. Closing an extension popup with a pending note asks before discarding. Abruptly closing the browser may leave a pending preparation entry, which is not shown in the timeline. Call notes are not automatically recoverable after closing the page. Notes saying “no answer” can be saved normally. Calls from already saved emails also retain a reference to that CRM email.

## Validation and limits

Automated coverage includes credential boundaries, migration, idempotency, ownership, timestamp preservation, existing-email retrieval, attachment metadata and phone extraction. Chromium browser fixtures exercise keyboard typing under document-level shortcut interception, a large quoted thread, entity creation before dialling, cancellation, notes, reload recognition, saved-message calling and the CRM call control.

These fixtures simulate Gmail structure and extension messaging while sending requests through the real HTTP backend. Live Gmail layouts, Chrome host permission prompts, Docker Desktop and a real Mac/iPhone call need checking on your machine. The app cannot detect whether the OS actually connected a call.
