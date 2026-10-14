# Gmail → Stage Force: first installation

This is a private Google Workspace add-on, not a Chrome extension. It reads the selected message only after **Zur CRM-Prüfung übernehmen** is clicked. No background inbox scan, email sending, drafts, forwarding, labels, deletion, AI processing or attachment transfer. Incoming and sent messages use the same button.

## 1. Update and deploy the CRM

You can test the new settings and the existing `.eml` workflow on localhost. Google runs the add-on on its own servers: it cannot deliver to `localhost:3000` on your computer. For the Gmail test, first deploy this version on your server with a publicly reachable HTTPS address, e.g. `https://crm.example.com`. Set `APP_URL` to exactly that origin, without a path. Your administrator handles HTTPS as before.

Back up before the schema upgrade (PowerShell, from the repository folder):

```powershell
docker compose -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/before-0.1.3.sqlite
docker compose -f compose.local.yaml cp crm:/app/data/before-0.1.3.sqlite ./before-0.1.3.sqlite
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Keep that backup private. Startup automatically adds the key table; do not reimport the spreadsheet or recreate accounts. For production, use `compose.yaml` instead of `compose.local.yaml`. The backup must be made before running the new image. Restoring the old version requires restoring this backup, because the database schema version advances from 1 to 2.

Verify login and the public icon URL `https://crm.example.com/assets/stageforce-icon.svg`. Reverse proxies must allow the authenticated server-to-server endpoint; a browser-only authentication wall in front of it will block Google. Do not remove the application's key authentication or enable CORS.

## 2. Create your Apps Script project

1. Sign into [script.google.com](https://script.google.com/) with `you@your-company.example` and create a standalone project named **Stage Force**.
2. Copy [Code.gs](../integrations/gmail/Code.gs) into its `Code.gs` file.
3. In Project Settings, enable **Show “appsscript.json” manifest file in editor**. Replace that file with [appsscript.json](../integrations/gmail/appsscript.json).
4. Replace the example hostname with your actual CRM hostname: update `CRM_ORIGIN` in `Code.gs` and all three hostname entries in the manifest (fetch allowlist, logo URL, open-link prefix). Keep HTTPS, exact host and the supplied path restrictions.
5. Save. Choose **Deploy → Test deployments → Install**, then **Done**. This installs an unpublished test add-on for you; do not deploy it as a web app.
6. Reload Gmail. Open the Stage Force icon in the right sidebar and authorize the add-on when prompted. Your Workspace administrator may need to allow the internal test app.

Expected permissions: run as a Gmail add-on, read the open message when you interact, connect to the configured CRM, and read your own Google email address to match the CRM account. The manifest intentionally contains no send, compose, modify, full-mailbox or broad `gmail.readonly` permission. Do not accept an unexpected write/full-mailbox permission by expanding the manifest to work around an error.

## 3. Pair your account

1. Sign into Stage Force as `you@your-company.example`.
2. Gear → **Gmail verbinden** → **Schlüssel erstellen**. Copy the key; it is displayed only during this opening of the settings menu.
3. Paste it into **Verbindungsschlüssel** in the Gmail sidebar and click **Verbinden**. Google and CRM email addresses must match. Use the same account in both systems; mailbox aliases are not separate CRM identities in this version.

The key is stored in Apps Script **User Properties**, never shared script properties or source code. It permits only the account's temporary import queue and an account-address check. It expires after 90 days. **Schlüssel erneuern** immediately invalidates the previous key; paste the replacement into the add-on after **Verbindung entfernen**. **Widerrufen** in the CRM invalidates it immediately. Removing the connection in Gmail only forgets its local copy; revoke it in the CRM too if the key should stop working everywhere. Password resets and account disabling also revoke keys.

Keep edit access to the Apps Script project restricted to trusted maintainers: an editor can change what the add-on executes. For testing colleagues, Google's test workflow requires project editor access; use a privately published, versioned Workspace deployment before rolling it out to users who should not edit code.

## 4. Test the complete flow

1. Open one harmless received test email in Gmail; select the particular message within a conversation.
2. Click **Zur CRM-Prüfung übernehmen**, then **Im CRM prüfen**.
3. Log into the matching CRM account if needed. Check sender, date, organisation, quote cleanup and source link. Add a short summary, contact or follow-up if useful. Confirm explicitly.
4. Verify the organisation history and last-contact date. The source link searches Gmail for the original RFC Message-ID under the correct mailbox; a fallback Gmail message link is used if that header is missing. It grants no mailbox access to colleagues. If a link cannot find a moved/deleted message, search the original mailbox manually.
5. Import the same message again. It should identify the existing CRM message instead of creating a second interaction. Repeated clicks before confirmation reuse the pending review.
6. Respond in Gmail as usual, then open your sent reply and use the button again if that reply belongs in the CRM. Responses are never captured automatically.

Only plain text and envelope fields cross to the CRM; no HTML, attachment bytes or Bcc list is transferred by the add-on. Quoted text can still exist inside the selected message. Cleanup is conservative and reversible in the review; inspect inline replies before saving. Pending imports are private to their owner and expire after 24 hours. Approved content becomes visible to CRM colleagues. The workflow does not change a message's Gmail state.

The existing `.eml` import remains available for other mail clients and localhost tests. It supports MIME parsing and attachment *metadata*, but never stores attachment bytes. A browser refresh after Gmail transfer makes new pending items available under **E-Mail übernehmen** if you do not use the direct review link.

## Troubleshooting and rollout

- **Connection fails:** verify `APP_URL`, the Apps Script origin and both manifest prefixes match; test the HTTPS site outside your LAN. Redirects are deliberately rejected so keys cannot be sent to another host. Check proxy routing, TLS and Workspace app policy.
- **Account mismatch:** use the same primary Google/CRM email. Do not borrow a colleague's key.
- **Expired key:** generate a replacement and pair again. Deleting browser cookies does not revoke the add-on key.
- **Expired review:** reimport the message within Gmail; unsaved reviews expire after 24 hours.
- **Rate/size limit:** at most 20 integration requests/minute/account (check and import each count), 30 pending messages, 3 MB JSON request and 500,000 text characters. Review the queue or record a relevant section manually.
- **Google permission/API error:** do not widen scopes. Note the action and error without copying email text or secrets into public issues; use the `.eml` fallback until resolved.

Automated tests cover the HTTP boundary, account ownership, key expiry/revocation, additive schema upgrade, MIME/text parsing and the Apps Script adapter using mocked Google services. They do not replace installation and a real end-to-end Gmail test. That live test and browser visual QA have not been performed in the development environment.

For a team-wide installation later, configure a standard Google Cloud project and publish the add-on privately to your Workspace organisation. This is separate from the personal test deployment above; no public Marketplace listing is needed for today's test.

Official references:
- [Test unpublished add-ons](https://developers.google.com/workspace/add-ons/how-tos/testing-workspace-addons)
- [Google Workspace add-on scopes](https://developers.google.com/workspace/add-ons/concepts/workspace-scopes)
- [Extend the selected-message UI](https://developers.google.com/workspace/add-ons/gmail/extending-message-ui)
- [URL allowlists](https://developers.google.com/apps-script/manifest/allowlist-url)
- [User Properties](https://developers.google.com/apps-script/guides/properties)
