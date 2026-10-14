# Email review and organisation timeline

Stage Force 0.1.7 uses one review wizard for `.eml` uploads and Gmail add-on captures. It does not read a mailbox autonomously, send email, create email drafts, forward, delete, label or mark messages as read. No AI processes the content.

## 1. Organisation

An existing organisation is suggested when matching provides a unique best candidate. **Stimmt** advances immediately. Otherwise use the live-filtered organisation picker or **Neue Organisation**. A new record receives an editable name suggestion from the external participant's domain, or their name for common public mail providers. It defaults to **Lead**. It is created only with the final Save, not by navigating between wizard steps.

Exact participant addresses rank above weaker email-domain/website matches. The sender of incoming mail or recipient of outgoing mail ranks above CC and quoted participants. Shared agency addresses with equal top matches do not select a winner. Public mailbox-provider domains do not establish organisation identity. Matching never merges organisations or establishes financial status.

The business distinction is **Kunde = confirmed obligation to pay**. Accepted paid offers and actual billing can supply evidence for the human decision; neither free use nor being an agency automatically makes someone a customer. The wizard and normal editor offer Kunde/Lead. Existing legacy statuses remain stored; the compact view displays Lead unless explicitly marked Kunde, and unclear/former classifications are flagged for review with their old status accessible under More details. Existing records already marked Kunde are not automatically re-audited for financial evidence. Invoice imports still do not change status automatically.

## 2. Kontakte

The wizard offers a checkbox per detected address/name. External current-message participants are initially checked. Uncheck people who do not belong to this organisation. Existing contacts with the same address inside the chosen organisation are reused. Selected new participants create contacts. Unchecking an existing contact does not delete it from the organisation.

Known team addresses, colleagues on known company domains, and participants detected only in explicitly quoted From/To/CC headers are available under **Weitere Beteiligte**, initially unchecked. Quoted-header extraction is bounded and conservative; prose/signature parsing is not a complete address-book extraction. Names and addresses remain reviewable; unsupported/missing contacts can be added through the regular contact editor.

Selected participants are linked to the resulting email activity. No contacts are merged across organisations. Ambiguous pre-existing duplicate contacts with the same address are not merged; the primary contact, then stable ID order, determines the reused record. A different address belonging to the same person is not inferred to be an alias. The regular contact editor can reconcile such cases.

## 3. Einordnen

The review shows the proposed email between its immediately newer and older communication events, with its position in the full timeline. Confirm or correct the date, review the cleaned text and save. The final button commits the message, a new organisation if requested, selected contacts, source reference and optional changes in one transaction.

Dates default to the email date in Europe/Berlin. No date header means a required human choice. Older imports cannot move the last successful contact backwards. Emails from team senders suggest outgoing; entirely internal forwards do not count as client contact by default. The count-as-contact option remains editable.

Email text is visible immediately. **Text bearbeiten** changes the CRM copy. **Original & Herkunft** reveals the full parsed text, quote-removal warnings, envelope, attachment names and optional inbox link. **Notiz, Status & nächster Schritt** holds optional summary, status/phase and follow-up fields. Attachments stay outside the CRM.

Duplicates are recognized across colleagues. An already imported email can only gain the current user's source reference; it does not create another organisation, email or contact set. If the source lacks a date, the duplicate flow reuses the previously reviewed date. Concurrent organisation edits block a stale confirmation and return the reviewer to organisation selection. Retrying the same confirmed import does not duplicate writes.

## Organisation view

The header contains the organisation name and Kunde/Lead badge. The main column is the newest-first communication timeline. Expand an email for its text, envelope and reviewed contacts; expand a call for its note. Contact lists, FastBill, follow-ups, review issues and **Mehr Details** are in the right column. Internal notes and CRM edits remain accessible under More details, separately paginated so recent admin changes do not bury older communications.

Ordering uses reviewed event date first, original email timestamp second, and recording order as a tie-breaker. Calls and legacy entries without a time appear after timed emails on the same date. This is a stable presentation order, not a claim about an unknown call time. Missing dates stay visible as unknown.

**Anruf eintragen** offers Erreicht / Nicht erreicht, an optional note, date and optional follow-up. Empty notes receive a simple outcome description. Missed calls appear in the timeline but do not advance the last successful contact. Logging a result from the daily call queue marks that queue item done and moves to the next organisation.

## Upgrade and validation

Back up before upgrading. Schema 4 adds the `activity_contacts` association table transactionally. Existing organisations, messages, contacts and history are retained without inventing associations for earlier imports. No repeat spreadsheet migration is needed. An older app refuses schema 4; downgrade requires the pre-upgrade database backup.

Tests cover shared-address ambiguity, public-domain exclusions, team/quoted suggestions, multi-contact selection, atomic organisation creation, scoped contact reuse, rollback, retries, duplicate handling, historical insertion, same-day ordering, pagination, HTTP access and additive upgrades. Interactive desktop/browser review is still required; this environment cannot run supported browser QA.
