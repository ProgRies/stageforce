# Email workflow

The CRM handles review and confirmation; the mail client only supplies a selected message. No background watcher, LLM extraction or email-write capability exists.

## Gmail add-on

Implementation: `integrations/gmail/Code.gs` and `appsscript.json`. Follow [gmail-setup.md](gmail-setup.md) for the private test installation and per-user pairing. The add-on reads a selected message only on a button click, sends plain text plus sender/recipients/date/subject/IDs (no attachments or Bcc list), and offers an authenticated review link. Replies must be imported separately from Sent. The CRM must be reachable by Google over HTTPS; localhost remains suitable for `.eml` tests.

Two POST-only server-to-server endpoints exist:

- `/api/integrations/gmail/check`: returns only the key owner's email address for account matching.
- `/api/integrations/gmail/import`: stages one message and returns only `reviewUrl`. JSON fields: `mailbox`, `gmailId`, `messageId`, `from`, `to`, `cc`, `date`, `subject`, `text`.

Both require `Authorization: Bearer <individual capture key>`, never accept session cookies as authorization, reject browser Origin headers, and do not enable CORS. The random key is hashed in SQLite, scoped to staging, revocable, bound to an active user and expires after 90 days. Browser key management still requires session, Origin and CSRF checks. Import limits: two concurrent parses, 20 integration requests/minute/user, 3 MB JSON, 500,000 body characters, 30 pending imports per user. Keys cannot read CRM records or confirm imports. The key's validity is checked again after asynchronous parsing, so revocation during parsing prevents staging.

Gmail URLs point back to the owner's mailbox; they do not share mailbox access. A review URL contains an opaque import ID, never credentials. Access requires the matching CRM login. Unconfirmed imports expire after 24 hours; confirmation/discard removes the temporary payload.

## Shared review and file fallback

Download a single `.eml` message and upload it while signed in to the CRM. This uses the existing session/Origin/CSRF protected route, with a 10 MB upload limit. Attachments are discarded after metadata extraction. Incoming and outgoing messages use the same review UI.

Sender matching suggests candidates but never silently assigns an unknown organisation. Multiple exact contact matches are offered for human choice. Contact creation is opt-in. The human chooses the organisation, approved text, summary and any status/follow-up changes. Confirmed content becomes visible to CRM colleagues.

Quote removal recognizes explicit quote lines, common original-message separators and signature markers. It retains unquoted inline answers. Human email formatting varies, so review includes the complete decoded message text and a restore-full-text button. Raw HTML is never displayed. A user-written summary becomes the timeline entry; approved email text is expandable.

A sent reply is not automatically captured. Import it from Sent, or add a manual `E-Mail gesendet` activity. A previously imported received email remains unchanged. Identical RFC Message-ID values deduplicate across colleagues; messages lacking that header use a deterministic fingerprint of original participants, date, subject and body. Missing headers, changed re-exports or reused Message-IDs can need manual checking; this is not semantic duplicate detection. An email already assigned to another organisation cannot be silently reassigned through import.

Keeping review and confirmation in the CRM allows another mail-client adapter or `.eml` files to replace Gmail without changing the business tables. Any future local LLM must offer suggestions within the review step, not bypass confirmation.
