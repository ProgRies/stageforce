# Database

StageForce keeps everything in one SQLite file, `DATA_DIR/crm.sqlite` (`/app/data/crm.sqlite` in the container). `server/schema.sql` is the executable schema; `server/db.mjs` applies it on every start.

The current schema version is **13** (`PRAGMA user_version`). Startup brings an older database up to 13 in one transaction and keeps all existing data. An application refuses a database newer than itself, so a rollback after an upgrade needs the backup taken before it. Back up before every update.

## Tables

| Table | Purpose |
| --- | --- |
| organisations | Name, status, phase, type, place, website, owner (user id), last contact, FastBill URL and an optimistic version number for concurrent edits |
| contacts | Person or team name and role |
| organisation_contacts | Which contacts belong to which organisation; a contact can belong to several |
| contact_addresses | Email addresses and phone numbers per contact, in order |
| organisation_links | One relationship between two organisations, with a note |
| organisation_locations | Optional map pin (latitude, longitude) per organisation |
| activities | Timeline entries: emails, calls, meetings and notes, with date, author and whether it counts as client contact |
| activity_contacts | Contacts linked to an email, call or meeting |
| meeting_refs | Links a meeting entry to the invitation it came from (join link or title), so updates and cancellations change that entry |
| meeting_status | Marks a meeting as cancelled |
| messages | Saved email: reviewed text, subject, participants, time, direction, attachment names and a unique duplicate key |
| message_originals | The full loaded text of a saved email, kept beside the stored reply |
| message_sources | Which user and mailbox saved an email; several colleagues can reference one email |
| extension_message_refs | Mailbox plus Gmail message id → saved email |
| extension_thread_refs | Mailbox plus Gmail conversation id → saved emails, so later emails of a conversation find the organisation |
| followups | The open follow-up (next action and due date) per organisation |
| review_issues | Open and closed Prüfen points |
| call_attempts | A started call: user, organisation, contact, number, time, direction, and the timeline entry once saved |
| call_drafts | The note of a call that is still open, so the call card can be resumed anywhere |
| call_reservations | Which user holds an organisation on today's call list |
| source_references | Where imported data came from |
| audit_log | Every change with author, time and before/after values |
| search_docs | Full-text search index (FTS5), rebuilt from the tables above |
| requests | Idempotency receipts, so a retried save is not stored twice |
| email_imports | .eml uploads waiting for review, removed after confirmation or 24 hours |
| fastbill_batches, fastbill_rows | Per-user FastBill import runs and their staged rows |
| fastbill_decisions | Shared decisions (added, assigned, not relevant) per FastBill account and row fingerprint |
| fastbill_mappings | Confirmed FastBill customer id/number → organisation |
| users | Accounts: email, name, scrypt password hash, active, must change password |
| sessions | Hashed session tokens with CSRF token, kind (browser or phone app), label, expiry and last use |
| login_challenges | The short step between password and authenticator code |
| login_limits | Sign-in attempt counters |
| user_mfa | Authenticator secret per user |
| mfa_recovery_codes | Hashed single-use recovery codes |
| extension_keys | One hashed, expiring browser-extension key per user |
| security_events | Sign-ins, failures and key or MFA changes, kept 90 days |
| user_appearance | Light, dark or system theme per user |
| schema_versions | When each schema version was applied |
| migrations, migration_archive | Provenance of the original spreadsheet import, kept read-only in databases that had it |

## Dates and order

Event dates are business dates in Europe/Berlin. Emails also keep their exact send time, and calls the time they were started. The timeline sorts by event date, then exact time, then recording order; an unknown date stays unknown. A planned meeting is a meeting entry dated in the future and counts as contact only once its day has come.

## Contacts and duplicates

Names and email addresses are not treated as unique person ids, and nothing merges contacts or organisations automatically. Shared mailboxes never force a match. Organisations are merged only by hand (Organisation verwalten → Zusammenführen).

New organisations come from the CRM, the browser extension, the phone app, an .eml upload or the FastBill review, one at a time.
