# StageForce: local CRM and Chrome extension

There are two user-facing parts: StageForce (web UI, API and SQLite in one container), and the browser extension. Gmail remains your mailbox. The extension calls the CRM API; it never opens or shares the SQLite file.

## Start locally

From the project folder, with Docker Desktop running:

```sh
docker compose up -d --build
docker compose exec crm node server/cli.mjs user:add you@example.com "Your Name"
```

Use the exact email address of the Gmail account you will import from. Choose a password of at least 12 characters at the hidden prompt. Open http://localhost:3000 and sign in. The database starts empty and persists in the Docker volume. Do not run `down -v` unless you intend to delete it. Existing production data is not downloaded or included.

After editing source code, rebuild with the first command. The database survives rebuilds.

## Pair your extension

1. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `integrations/chrome` (the folder with `manifest.json`).
2. In StageForce, open the gear → **Browser-Erweiterung verbinden** → **Schlüssel erstellen**. Copy the personal key, which is shown only once.
3. Click the extension's toolbar icon (pin it if useful). Enter `http://localhost:3000` and the key. Click **Connect** and grant access to that CRM host.
4. Refresh Gmail. Open a received message and click **Add to StageForce**, next to its timestamp.
5. Check the prefilled organisation, contacts, time and text; click **Save & Continue**. It closes the popup and leaves you in Gmail. **Save & Open** opens the organisation in StageForce.

Use the same hostname for CRM login and extension pairing. Each colleague needs their own CRM user and key. In the current version the Gmail account address must equal the CRM user's address. If Gmail's account label cannot be detected, the popup requires you to enter/confirm it under Message details. Multiple aliases are not automatically trusted or inferred.

## What is sent, and when

- The button checks the mailbox and Gmail message identifier against the CRM. For older/unrecognized messages it reads the loaded text locally to compute a SHA-256 fallback fingerprint; only that digest is transmitted during the check.
- Clicking it reads that single loaded message into memory.
- Opening the popup sends sender/visible-recipient addresses and names plus mailbox address to the configured CRM for matching. Organisation searches send the typed search text. No email body is sent yet; these lookups do not create CRM records.
- Save sends the reviewed message text, subject, timestamp, envelope, selected contacts, chosen organisation and optional linked organisation. The unedited loaded body is also transmitted to compute a duplicate fingerprint, but the reviewed body is what is retained in `messages`.
- Starting a call saves the chosen organisation/contact/number first. The note and the result are then taken in the floating call card (shared with the CRM), which stays above every tab and app in a Chrome Picture-in-Picture window; the popup can be closed meanwhile. Save records the note, the result and the original click time. Discarding removes the pending call preparation and preserves the organisation/contact. One call per user is open at a time; its note is kept on the server while it runs.
- No attachment bytes are sent. No external AI, analytics, email delivery or Google OAuth is used. The extension does not send, draft, forward, delete, label or mark messages in Gmail.
- All active CRM colleagues can read the saved content. The application currently has shared team access, not per-organisation permissions.

## Connection protections

The extension uses its background worker for network requests. Only its own options page can set the CRM address/key. Gmail content scripts can ask for fixed matching, saved-message, import and call operations, not arbitrary URLs. The worker rejects redirects and omits browser cookies.

Credentials are random 256-bit, account-specific bearer tokens, stored only as hashes on the server. They expire after 90 days; replacing or revoking a key invalidates it immediately. Password reset and account disabling revoke keys too. One active key per user is supported; rotating it means reconnecting that user's devices.

The extension stores its key in the local browser profile using `chrome.storage.local`, restricted to trusted extension contexts. It does not use Chrome Sync and does not expose the key to Gmail's content script. This is access isolation, not encrypted secret storage: someone controlling the device/profile can steal the key. Use OS disk encryption and locked, individual browser profiles.

The extension key cannot access generic CRM routes, account administration or FastBill. It can read matching information and the stored message identified by an opened Gmail message, create confirmed imports/contacts/organisation links, explicitly edit contacts under the selected organisation, and prepare/save/cancel its user’s calls. Web-session mutations still require session cookies, exact Origin and CSRF checks. Website-origin requests to the extension endpoint are rejected; bearer authorization is required even if an Origin header is absent. No wildcard CORS is enabled.

## Local and later hosted use

Local HTTP is permitted only for `localhost`/`127.0.0.1`; Compose binds port 3000 to your computer's loopback interface. The API key is still required. Do not expose the development configuration on a LAN or public interface.

For shared hosted use, run the same CRM service behind HTTPS with a valid certificate, correct `APP_URL`, persistent local disk and backups. Each extension is paired with that HTTPS origin and the colleague's key from that CRM. Never log Authorization headers or request bodies at the reverse proxy. Protect backups and the server disk with encryption and restricted access: SQLite itself is not encrypted by this application. This is TLS transport to your server, not end-to-end encryption against your server administrators.

## Matching and extraction limits

A unique exact external contact-address match is preselected. Shared-address ambiguity and domain-only suggestions require your choice. A single existing linked organisation is prefilled; new relationships are never guessed from an email domain.

Automatic contact suggestions are drawn from loaded headers. To add a contact from the body, highlight one person’s details and choose Extract contact, then review and save. Selection parsing is local; contact saving sends only the reviewed name, email, phone numbers and organisation context. The contact pencil also edits names and phone numbers on saved messages. Gmail DOM selectors are undocumented. Collapsed headers may omit recipients and To/Cc roles are not reliably distinguished; expand the header and reopen when needed. Quoted text already loaded in the message is included, but unloaded messages and attachment contents are not.

ISO timestamps and explicit numeric German timestamps are parsed. Numeric Gmail times use the browser's timezone; unsupported/relative formats require manual confirmation. The time field exposes the browser timezone and original timestamp in its tooltip. Check timezone and daylight-saving ambiguity when importing historical email.

Retries use a request ID; repeated extension imports use mailbox-scoped Gmail identifiers with a content-fingerprint fallback. This is not a verified RFC Message-ID, so differently rendered copies and prior .eml imports can evade duplicate detection. Review unfamiliar duplicates before saving.

## Validation

72 automated tests pass, including key hashing, expiry, rotation/revocation, account and request isolation, CSRF boundaries, conservative matching, rollback, duplicate saves, migration and dates. A Chromium Gmail-like fixture also passed prefill, header-only lookup, HTTP save into SQLite, date preservation, duplicate save and Save & Open; desktop/mobile layouts were inspected. The fixture mocks Chrome messaging; it does not validate the installed extension’s host-permission prompts. A real Gmail test and Docker start on your computer remain necessary; fixtures cannot guarantee Google's live markup or your browser/network policies.

For the current saved-message, phone, attachment-reference and call workflow, see [the local update guide](update-local.md).
