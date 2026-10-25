# Database and migration

`server/schema.sql` is the executable schema. Tables use foreign keys and stable text IDs. `PRAGMA user_version` tracks the schema version; future application versions must introduce an explicit versioned migration before changing a deployed database. An older binary refuses a newer schema. Current version: 8. Version 3 added FastBill import tables; version 4 added `activity_contacts`; version 6 replaces legacy integration credentials. Startup applies these additive changes in a transaction and preserves existing CRM data. Back up before upgrading. Older binaries refuse newer databases; rollback requires restoring the pre-upgrade backup.

| Table | Purpose / relationship |
| --- | --- |
| organisations | Scalar master data, status, phase, owner, summary, last contact, FastBill URL, optimistic version |
| contacts | Person/team name and role |
| organisation_contacts | Organisation ↔ contact membership; at most one primary contact per organisation |
| contact_addresses | Multiple email addresses/phone numbers per contact; primary address ordered first |
| activities | One interaction/note per row; linked organisation and optional signed-in author/message |
| meeting_refs | One row per detected video-call invitation per organisation; points at its Meeting activity so updated or cancelled invitations change that entry instead of adding another |
| activity_contacts | Explicitly reviewed email/call activity ↔ contact associations; no backfill/inferred links for old messages |
| messages | Approved text, subject, participants, sent timestamp, direction, attachment metadata and unique deduplication key |
| message_sources | Mailbox owner and optional original URL; multiple colleagues may reference one message |
| followups | Next action and due date; at most one current follow-up per organisation in v0.1 |
| organisation_links | One relationship per sorted organisation-ID pair, with a free-text note |
| review_issues | Open/resolved review text; missing-phone/FastBill checks are additionally computed |
| source_references | Original provenance attached to an organisation, contact or activity |
| audit_log | Author, timestamp and structured before/after values for organisation edits; contact/link/import events |
| users / sessions | Local accounts, salted scrypt password hashes, hashed opaque session tokens and CSRF tokens |
| email_imports | Per-user, short-lived review payload; removed on confirmation/discard/expiry |
| fastbill_batches / fastbill_rows | Per-user review runs and whitelisted source payloads; deleting a run cascades to staged rows |
| fastbill_decisions | Account-scoped fingerprints, applied/ignored decision, reviewer, target and note; survives run deletion |
| fastbill_mappings | Account-scoped customer ID/number to organisation associations; many-to-many, never an automatic merge |
| requests | Idempotency receipts for saves and email confirmations |
| migrations / migration_archive | Import fingerprint/report and immutable original data retained to prevent loss |
| search_docs | SQLite FTS5 index; derived, not authoritative customer data |

Dates in existing records remain ISO date-only values. An unknown legacy date stays NULL. New email messages retain their timestamp where available; the reviewed activity date is interpreted as the business date in Europe/Berlin. Recording time and event date are separate. Existing `last_contact` values are carried over; internal CRM cleanup events do not become client interactions.

Names and email addresses are not assumed to be globally unique person IDs. Agency contacts can belong to multiple organisations in the schema. The initial contact editor creates contacts within the selected organisation; the first release does not offer cross-organisation person merging. Shared mailboxes never force automatic merges.

The old main-contact scalar columns are matched to the contacts JSON. If exactly one phone-only contact matches, it is reused. If no unambiguous match exists, a separate main-contact record is preserved and the report calls this out. The full original row and contact payload remain available in the migration archive. Unknown legacy metadata is retained as provenance JSON; it is not used as a substitute for normalized operational data.

The relationship tab is canonical; mirror JSON entries are folded into the same pair. Conflicting notes or unresolved IDs are reported and preserved in the archive. The importer refuses duplicate organisation IDs or unexpected headers, imports in one transaction, and validates foreign keys. Malformed metadata is reported and retained rather than dropped.

Validate each private snapshot by comparing organisation, contact, activity and relationship counts, checking foreign-key integrity and reviewing the private migration report. Structural verification does not establish business accuracy.

The UI loads a compact organisation list and queries the full-text index for deeper matches. History is paged in batches of 40; email bodies are fetched on expansion. No attachments or mailbox mirror are stored. Search-index updates and business writes share the same transaction.

Communication history and internal notes are separately filtered and paginated. Both use the reviewed event date, then the original email timestamp when present, then recording order. The wizard computes the proposed position from all communication rows, not just the first page. Unknown dates remain unknown; calls without a time sort after timed emails on the same date. Email import explicitly whitelists status, phase and follow-up changes, so it cannot override the last-contact date directly.

## Schema 6: browser extension

Adds `extension_keys` (one hashed, revocable, expiring credential per user). Removes obsolete Gmail add-on credentials. CRM records, contacts and messages are preserved. Existing databases require a backup before upgrade; rollback needs the matching pre-upgrade database.

## Schema 7: durable identity and calls

`extension_message_refs` maps mailbox plus stable Gmail identifier to a stored message. `call_attempts` records the click timestamp, dialled number, user, organisation/contact and optional source message. Save links it to one activity; cancel deletes the pending row. Existing data is preserved. Timed calls sort by original click time alongside email timestamps. Calls do not imply successful contact.

## Schema 8: appearance

`user_appearance` stores each user’s light, dark or system preference. CRM settings save the preference through the authenticated API; the extension reads it when opening its popup.
