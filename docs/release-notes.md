# Stage Force 0.1.6

## FastBill import review

The sidebar now opens **Importe**, with E-Mail and FastBill sources. FastBill customer CSV exports and optional invoice context go through column review, organisation matching and explicit field/contact confirmation. Unrelated records can be skipped. Repeated exports remember confirmed mappings and unchanged skip decisions; changed source data returns for review.

The optional API adapter works from local Docker using outgoing HTTPS. Fetch customers, contacts or invoice context in pages of 100. Only `customer.get`, `contact.get` and `invoice.get` are available. Credentials remain transient; billing data is not synchronized automatically. No email or FastBill sending/write actions are implemented.

Missing-phone/link checks update after confirmed enrichment. Existing manual review notes and customer/contact dates are preserved. Internal customer IDs and customer numbers are separate. Customer URLs are not guessed. [Instructions](https://github.com/ProgRies/stageforce/blob/main/docs/fastbill-import.md).

## Update

Back up first, then update and rebuild:

```sh
docker compose -f compose.local.yaml exec crm node server/cli.mjs backup /app/data/backups/before-0.1.6.sqlite
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh your browser. Schema 3 adds four import tables automatically. Existing organisations, users and history remain intact. Do not repeat the initial spreadsheet import. Rollback to an older version requires the pre-upgrade backup.

Validated with automated service/parser/security tests, TypeScript and production build. Live FastBill export/API compatibility and interactive browser testing remain outstanding. All fixtures are fictional.

The versioned image is available only after successful release publication: `ghcr.io/progries/stageforce:0.1.6`.
