# Email workflow and future Gmail button

## Working now

The user downloads a single `.eml` message, uploads it while logged into the CRM, reviews a temporary import and confirms. Incoming and outgoing messages use the same flow. Sender matching suggests candidates but never silently assigns an unknown organisation. Multiple exact contact matches are offered for human choice. Contact creation is opt-in.

A sent reply is not automatically captured. Import it from Sent, or add a manual `E-Mail gesendet` activity. A previously imported received email remains unchanged. Identical RFC Message-ID values deduplicate across colleagues; messages lacking that header use a deterministic fingerprint of original participants, date, subject and body. In ambiguous cases (missing headers, materially changed re-exports, reused Message-IDs) the user should inspect the result; this is not semantic duplicate detection. An email already assigned to another organisation cannot be silently reassigned through import.

Quote removal recognizes explicit quote lines, common original-message separators and signature markers. It retains unquoted inline answers. Because human email formatting varies, review always includes the complete decoded message text and a restore-full-text button. Raw HTML is never displayed; attachments are discarded after metadata extraction. An optional user-written summary becomes the timeline entry; approved email text is expandable.

## Next phase: Google Workspace add-on

This release deliberately does not install a Google project, request mailbox permission or expose an unauthenticated integration endpoint.

The planned add-on will use Google's interaction-scoped access to the currently selected message. A minimal Apps Script component extracts the message and submits it to a dedicated endpoint on the self-hosted CRM. That endpoint will accept an individual revocable capture credential, authorize temporary import creation only, enforce rate/size limits, and bind the review to the matching CRM user. Credentials are never placed in shared script properties or review URLs.

The add-on then presents **Open review**. The colleague follows the link to the CRM and signs in; the opaque import ID is not authorization by itself. The same review UI handles matching, quote cleanup, contact suggestions and confirmation. No mail sending/modification permission is required. The current browser upload route requires a local CRM session and CSRF token and must not simply be opened to Google clients by weakening those checks.

Steps when implementing: create Apps Script test project; install privately for initial testing; register a standard Google Cloud project and explicit OAuth scopes; publish privately to the same Workspace organisation; pair each colleague with their CRM account. Provide administrator installation instructions at that phase.

Keeping the import/review logic in the CRM allows another mail-client adapter or `.eml` files to replace Gmail without changing the database. Any future local LLM must produce optional suggestions within this review step, not bypass confirmation.
