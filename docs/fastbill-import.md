# FastBill import review

**Importe → FastBill** brings FastBill customers into the CRM. CSV files and read-only API pages feed the same review queue. Nothing changes in FastBill. Nothing changes in an organisation until a reviewer confirms it. All parsing and matching are deterministic; no AI or external parsing service is used.

## Start with a customer CSV

In FastBill, open **Kunden → Export**, select **CSV**, and enable **Ansprechpartner exportieren?**. Alternatively use **Import Export → Kundendaten** for a direct download. Use the customer export first to find names, email addresses, phone numbers and customer identifiers.

1. Open **Importe → FastBill → CSV auswählen** in StageForce.
2. Enter the FastBill main account's email as the account identifier. Use the same value for every export, including imports by colleagues. API imports use that email automatically. This keeps identical customer numbers from different accounts separate.
3. Select the original CSV, without opening and re-saving it in Excel. Review the suggested column mappings and the first-row sample. Choose **Nicht übernehmen** for unneeded columns. Internal customer ID and customer number are distinct fields.
4. Select **Zur Prüfung laden**. The private review queue survives browser closure and application restart.
5. Select a row. StageForce lists **Mögliche Treffer im CRM**: a confirmed customer number/ID, the same email address, phone number or company domain, the same contact person, or a similar name (legal forms such as GmbH, e.V. or & Co. KG are ignored). Free-mail domains and short generic names are not counted. The list on the left shows the best guess (`≈ Name`) or **Neu** for each open row.
6. If the row belongs to an existing organisation, pick it and select **Zuordnen**. Tick fields to copy; only blank city, website or customer-link fields are preselected. To import phone/email data, tick **Kontaktdaten übernehmen** and choose an existing contact to append addresses to, or create a new one.
7. If the customer is not in the CRM yet, select **Als neue Organisation hinzufügen**. One click creates exactly one organisation from that row: name, city, website and customer link where present, and the row's contact person as main contact. No other fields are added. The customer export carries no billing data, so the organisation starts as **Lead**; it starts as **Kunde** only when an invoice export of the same FastBill account, staged before, holds a bill for that customer number/ID that is neither cancelled nor a draft. If there are possible matches, StageForce asks once more before adding. A new organisation without an email address goes to **Prüfen** ("E-Mail-Adresse fehlt (FastBill-Import)"), the same list a call with "E-Mail nötig" uses.
8. **Nicht relevant** records a skip decision without touching CRM data.

After each decision the next open row opens, so a large export can be worked through click by click over several sessions. Nothing is added to the CRM without one of these clicks. Further contact rows of a customer you just added show that organisation as a confirmed match instead of offering a second one.

To pick up later, import the same file again with the same account identifier. Rows already added, assigned or marked **Nicht relevant** are recognised and skipped; only new or changed rows stay open. A decision also closes the same row in older import runs.

## Invoice exports are evidence, not a second ledger

For invoice context, use **Ausgangsrechnungen (neu)**, CSV, with a deliberate date range. Choose one row per invoice for a compact overview, or one row per invoice line when the descriptions are needed to distinguish Stage from other services. Include all relevant records rather than only open items when researching historical relationships.

StageForce stages invoice numbers, dates, titles/descriptions, type and cancellation/status text where present, alongside customer identifiers. Amounts, tax data, payment details, bank details, attachments and document-access URLs are not selected by the built-in mappings or API adapter. Unmapped CSV columns are dropped when staging; the raw file is not retained. Invoice lines are separate review items, with identical retained rows deduplicated.

Invoice evidence does not automatically establish current customer status, payment, product usage or last contact. Confirm any business conclusion through the normal organisation editor. The CRM stores the reviewed customer references and optional note, not the invoice payload as a permanent financial ledger. The staged context remains in its import run until you delete it.

FastBill stays authoritative for billing. Customer URLs remain manually entered or explicitly mapped from an existing URL column. The documented customer API exposes a customer-facing document-history link, not a verified internal customer-profile URL; StageForce does not substitute that link or construct an unverified URL from a customer number.

## Use the API

The API works from a local CRM as well as from the server. The Docker container needs outgoing HTTPS access to `my.fastbill.com`.

1. In FastBill, the main account user opens **Einstellungen → Übersicht → API-Key**.
2. In StageForce, choose **Importe → FastBill → API abrufen**.
3. Enter the main account email and API key directly in the CRM. Do not put them in source code, an issue, a screenshot or chat.
4. Choose **Kunden** and **Erste 100 abrufen**. Each click fetches one page. Further pages append to the same import run; repeated page contents deduplicate. Use **Zur Prüfliste** to review, or **Fertig · Schlüssel leeren** to clear the key and review.
5. Review customer mappings first. Then optionally fetch **Ansprechpartner** and **Rechnungen als Prüfhinweis**. Internal IDs from confirmed API customers help associate later contact rows.

The key is held only in component memory while the FastBill window remains open; it is cleared by the explicit clear button, closing that window, or reload. The server uses it for the request and does not persist it, log it or return it. It is never placed in browser storage or URLs. HTTPS is required for deployed use; the local Compose configuration binds to loopback only.

The server has a fixed endpoint and a hard allowlist: `customer.get`, `contact.get`, `invoice.get`. No arbitrary service, destination URL, write call, sending action, automatic polling, webhooks or credential-storage feature is exposed. The FastBill key itself may permit more than read operations; read-only behavior is enforced by this application, not by a claimed provider scope.

FastBill currently documents 100 results per page and plan-dependent hourly call limits (Solo 50, Solo-Plus 100, Pro 500, Premium 1000). An error does not advance the page or apply partial results. No background retries run. Closing/reloading the dialog resets the API cursor; starting again is safe because reviewed evidence is remembered. The adapter targets FastBill API v1.0, not the separate FastBill Next API.

## Repeat imports, corrections and limits

- Fingerprints cover retained source fields. Identical reviewed or skipped rows are marked accordingly on another import. Changed retained fields create a new pending review. Changes to discarded financial fields do not trigger CRM review.
- Confirmed customer ID/number mappings are scoped to the FastBill account. One payer can have multiple explicitly confirmed CRM associations; this never merges organisations. Agency/ministry relationships still require human judgment.
- **Erneut prüfen** clears the remembered decision and that customer's remembered mapping to the prior organisation. Previously approved CRM fields, contacts, provenance and history remain. Correct those in the organisation editor if needed; reopening is not a rollback.
- Queue rows are private to the uploader. Decisions and confirmed mappings are shared. A decision closes identical open rows in every run for that FastBill account; a stale screen gets a conflict message instead of a second save. Organisation versions protect concurrent edits.
- Deleting an import run removes its staged rows, not confirmed CRM changes, shared mappings or fingerprint decisions. Kept runs are included in SQLite backups.
- Maximum 8 MB CSV, 10,000 rows per run and 20 retained runs per user. Lists page at 100 rows. API pages also append up to 10,000 records per run. Delete completed runs when no longer needed.
- Supported: UTF-8/BOM and browser-decoded Windows-1252, comma/semicolon/tab delimiters, quoted delimiters, escaped quotes, multiline cells. XLSX, ZIP, DATEV and attachment imports are not supported. Malformed structure rejects the whole upload before staging.
- Automatic missing-phone/link checks update after actual fields change. Manual review notes are never silently cleared.

## Official references

- [Customer exports](https://support.fastbill.com/hc/de/articles/360012777940-Kunden-daten-exportieren)
- [Invoice export fields](https://support.fastbill.com/hc/de/articles/21072842352668-Produkte-und-Projekte-auswerten)
- [API key setup](https://support.fastbill.com/hc/de/articles/204843527-FastBill-API)
- [Authentication, pagination and limits](https://apidocs.fastbill.com/)
- [Customer and contact API](https://apidocs.fastbill.com/fastbill/de/customer.html)
- [Invoice API](https://apidocs.fastbill.com/fastbill/de/invoice.html)
