# Gmail → Stage Force: first installation

This is a private Google Workspace add-on, not a Chrome extension. It reads the selected message only after **E-Mail zuordnen** is clicked. No background inbox scan, email sending, drafts, forwarding, labels, deletion, AI processing or attachment transfer. Incoming and sent messages use the same button.

## Upgrade an already-installed add-on to 0.1.12

1. Back up the hosted database; deploy the new `latest` image (or pin `0.1.12`). Startup adds a permission flag to Gmail keys (schema 5). Existing CRM records and old capture keys are retained.
2. Replace **Code.gs** in your existing Apps Script project with the current repository file. Keep `CRM_ORIGIN = 'https://stageforce.jaimo.me'`. Save, then reload Gmail. The manifest and its four Google scopes are unchanged; keep your configured hostname there.
3. In the hosted CRM: **⚙ → Gmail verbinden → Schlüssel erneuern**. This explicitly grants CRM organisation lookup and import confirmation to the new key. Existing keys remain capture-only.
4. In the Gmail sidebar: **Verbindung entfernen**, paste the replacement key into **Verbindungsschlüssel**, then **Verbinden**. Use the same primary account in Gmail and CRM.
5. Open an email → **E-Mail zuordnen**. Complete the three steps below entirely in Gmail.

If you use a versioned private deployment rather than the editor test installation, update that deployment to the new script version. Updating the Docker container does not update Apps Script automatically.

## 1. Update and deploy the CRM

Google runs the add-on on its own servers: it cannot deliver to `localhost:3000` on your computer. Deploy the CRM at **https://stageforce.jaimo.me** using the [administrator guide](deployment.md#first-production-deployment-ghcr). Production Compose pulls the published GHCR image and derives `APP_URL` from `CRM_HOST`.

Back up an existing database before updating. Restore your locally worked-on SQLite database if you want to preserve local edits and accounts; do not reimport the original spreadsheet after restoration.

Verify login and the public icon URL `https://stageforce.jaimo.me/assets/stageforce-icon.svg`. Reverse proxies must allow the authenticated server-to-server endpoint; a browser-only authentication wall in front of it will block Google. Keep the application's key authentication; no CORS change is needed.

If the add-on is already visible in Gmail, verify its configured hostname below, then proceed directly to **3. Pair your account**.

## 2. Create your Apps Script project

1. Sign into [script.google.com](https://script.google.com/) with `you@your-company.example` and create a standalone project named **Stage Force**.
2. Copy [Code.gs](../integrations/gmail/Code.gs) into its `Code.gs` file.
3. In **Projekteinstellungen**, enable **Manifestdatei „appsscript.json“ im Editor anzeigen**. Replace that file with [appsscript.json](../integrations/gmail/appsscript.json).
4. Replace the example hostname with your actual CRM hostname: update `CRM_ORIGIN` in `Code.gs` and all three hostname entries in the manifest (fetch allowlist, logo URL, open-link prefix). Keep HTTPS, exact host and the supplied path restrictions.
5. Save. Choose **Bereitstellen → Bereitstellungen testen → Installieren**, then **Fertig**. This installs an unpublished test add-on for you; do not deploy it as a web app.
6. Reload Gmail. Open the Stage Force icon in the right sidebar and authorize the add-on when prompted. Your Workspace administrator may need to allow the internal test app.

Expected permissions: run as a Gmail add-on, read the open message when you interact, connect to the configured CRM, and read your own Google email address to match the CRM account. The manifest intentionally contains no send, compose, modify, full-mailbox or broad `gmail.readonly` permission. Do not accept an unexpected write/full-mailbox permission by expanding the manifest to work around an error.

## 3. Pair your account

1. Sign into Stage Force as `you@your-company.example`.
2. Gear → **Gmail verbinden** → **Schlüssel erstellen**. Copy the key; it is displayed only during this opening of the settings menu.
3. Paste it into **Verbindungsschlüssel** in the Gmail sidebar and click **Verbinden**. Google and CRM email addresses must match. Use the same account in both systems; mailbox aliases are not separate CRM identities in this version.

The key is stored in Apps Script **User Properties**, never shared script properties or source code. Keys created with the updated CRM settings allow the account-address check, temporary message capture, and the narrow sidebar review API. Review can search organisation names/IDs, identify existing participant contacts, show neighbouring timeline titles/dates, and confirm that user's own import. It cannot call general CRM APIs, edit arbitrary records, access FastBill or read other users' pending imports. Older keys remain capture-only until explicitly replaced. It expires after 90 days. **Schlüssel erneuern** immediately invalidates the previous key; paste the replacement into the add-on after **Verbindung entfernen**. **Widerrufen** in the CRM invalidates it immediately. Removing the connection in Gmail only forgets its local copy; revoke it in the CRM too if the key should stop working everywhere. Password resets and account disabling also revoke keys.

Keep edit access to the Apps Script project restricted to trusted maintainers: an editor can change what the add-on executes. For testing colleagues, Google's test workflow requires project editor access; use a privately published, versioned Workspace deployment before rolling it out to users who should not edit code.

## 4. Test the complete flow

1. Open one existing received email in Gmail; select the particular message within a conversation. Click **E-Mail zuordnen**. Only this click reads and transfers the selected message into your temporary CRM review queue.
2. **Organisation (1 / 3):** confirm the suggested organisation with **Stimmt · weiter**, or use **Andere Organisation**. Suggestions update while typing; select a result. **+ Neue Organisation** suggests a name, with Lead as the default. New records are created only at final save.
3. **Kontakte (2 / 3):** tick the people who belong to that organisation. Known contacts are labelled; team and quoted participants start unchecked. Unchecking a contact never deletes an existing contact.
4. **Prüfen & speichern (3 / 3):** compare the cleaned message with Gmail, check date, direction and timeline placement, optionally add a short note. Choose **Vollständigen Text verwenden** if quote removal lost relevant text. Long messages have paginated previews; pagination does not truncate the saved text. If you change the date, the first save click refreshes the placement; confirm again after checking it.
5. Click **Im CRM speichern**. The server commits organisation (if new), selected contacts and email together. **Organisation öffnen** then opens that record in the CRM for further editing. **Im CRM weiterbearbeiten** remains available before saving for custom text edits or more complex changes; unsaved sidebar choices are not transferred to the browser wizard.
6. Reimport the same message: it must show the existing organisation and offer only **Quellverweis ergänzen**, never create a second timeline event. An older email must retain its historical date and not replace a newer last-contact date.
7. Test an existing sent reply the same way. Replies are not captured automatically; the add-on never sends them.

The native Gmail sidebar uses Google's card widgets. Stage's purple header/primary buttons are supported; custom CSS, backdrop blur and glass/gradient card backgrounds are not. The full CRM keeps its glass appearance. No AI is involved: parsing, quote removal and matching are deterministic suggestions subject to your confirmation.

Only small per-message review choices are cached in Apps Script's user cache for up to one hour (Google may evict them sooner); message bodies and keys are not stored in that cache. If evicted, restart **E-Mail zuordnen**. The pending message remains in your CRM queue for up to 24 hours. Messages with more than 80 detected participants use the full CRM reviewer to keep the sidebar manageable.

Only plain text and envelope fields cross to the CRM; no HTML, attachment bytes or Bcc list is transferred by the add-on. Quoted text can still exist inside the selected message. Cleanup is conservative and reversible in the review; inspect inline replies before saving. Pending imports are private to their owner and expire after 24 hours. Approved content becomes visible to CRM colleagues. The workflow does not change a message's Gmail state.

The existing `.eml` import remains available for other mail clients and localhost tests. It supports MIME parsing and attachment *metadata*, but never stores attachment bytes. A browser refresh after Gmail transfer makes new pending items available under **E-Mail übernehmen** if you do not use the direct review link.

## Troubleshooting and rollout

- **Connection fails:** verify `APP_URL`, the Apps Script origin and both manifest prefixes match; test the HTTPS site outside your LAN. Redirects are deliberately rejected so keys cannot be sent to another host. Check proxy routing, TLS and Workspace app policy.
- **Account mismatch:** use the same primary Google/CRM email. Do not borrow a colleague's key.
- **Expired key:** generate a replacement and pair again. Deleting browser cookies does not revoke the add-on key.
- **Expired review:** reimport the message within Gmail; unsaved reviews expire after 24 hours.
- **Rate/size limit:** at most 20 capture/check requests and 120 review/search requests per minute/account, 30 pending messages, 3 MB JSON request and 500,000 text characters. Review the queue or record a relevant section manually.
- **Google permission/API error:** do not widen scopes. Note the action and error without copying email text or secrets into public issues; use the `.eml` fallback until resolved.

Automated tests cover the HTTP boundary, account ownership, key expiry/revocation, additive schema upgrade, MIME/text parsing and the Apps Script adapter using mocked Google services. They do not replace installation and a real end-to-end Gmail test. That live test and browser visual QA have not been performed in the development environment.

For a team-wide installation later, configure a standard Google Cloud project and publish the add-on privately to your Workspace organisation. This is separate from the personal test deployment above; no public Marketplace listing is needed for today's test.

Official references:
- [Test unpublished add-ons](https://developers.google.com/workspace/add-ons/how-tos/testing-workspace-addons)
- [Google Workspace add-on scopes](https://developers.google.com/workspace/add-ons/concepts/workspace-scopes)
- [Extend the selected-message UI](https://developers.google.com/workspace/add-ons/gmail/extending-message-ui)
- [URL allowlists](https://developers.google.com/apps-script/manifest/allowlist-url)
- [User Properties](https://developers.google.com/apps-script/guides/properties)

## Organisation search shortcut (0.1.9)

**In Gmail suchen** is a normal external browser link; it works with a localhost CRM and needs neither an add-on nor a connection key. It targets your CRM email via Gmail's account selector and uses a quoted organisation name OR known `from:`/`to:` contact addresses. The query is URL-encoded and length-bounded. Verify the selected Gmail account if several are signed in. [Google's search syntax](https://support.google.com/mail/answer/7190?hl=en).

The original capture endpoint and browser review link (`/?import=...`) remain supported. Version 0.1.12 adds the separate, permission-gated sidebar review endpoint; the original capture-only key does not gain that permission automatically. Automated tests cover this contract, including selected-message reads without mailbox writes. The new timeline retains a message's original-source link. Test a received message, a sent reply and a duplicate after public HTTPS deployment; then verify the timeline, date and selected contacts. For the 0.1.12 sidebar review update, replace Code.gs and renew the CRM key as described above.
