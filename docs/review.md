# Review workbench

**Prüfen** is a separate workbench. The middle panel lists categories and their counts; the right panel shows affected organisations. Open one to inspect/edit it, then use **Zur Liste** to return with the group's search and status filter preserved. Categories remain available while viewing details. Unsaved editor changes require confirmation before switching review groups or organisations.

## What the counts mean

The sidebar and heading count distinct organisations with at least one open issue. Each category counts distinct organisations in that group. An organisation may belong to several groups, so category counts should not be added together as a total task count. No new “missing” fields have been added to the previous automatic checks.

Automatic checks:

- **FastBill-Link:** missing/invalid HTTPS FastBill link for a customer, former customer or offer.
- **Telefonnummer:** no contact number with at least six digits. This is a basic usability check, not verification that the number works.
- **Status widersprüchlich:** relationship is Lead while sales phase is Gewonnen.

## Existing review notes

Notes are grouped using deterministic topic keywords into contract/billing, organisation/relationships, customer status/usage, contacts/responsibility, or an unclassified group. A note can appear under several topics. This is navigation, not a factual interpretation: confirmed statements or negations inside an open note do not cause automatic resolution. Unknown wording stays visible in **Weitere Prüfnotizen**.

The complete note is preserved in the record. A result row shows an excerpt; opening it shows the full matching finding. To resolve or correct it, use **Bearbeiten → Offene Angaben / Prüfbedarf** and save the reviewed wording. Existing audit/history behaviour is retained. No bulk dismissal or automatic rewriting is offered.

Fixing a phone number, FastBill link or status automatically removes the corresponding field check. An old note mentioning the same issue stays open until a human edits it. This avoids silently discarding a substantive question merely because a field was filled in.

A corrected record remains open for confirmation; the category count updates immediately. If it no longer matches the selected group, a short completion message appears. It will no longer appear in that group's result list when returning.

## Local testing

This view works with the existing local SQLite data. No Gmail connection, external service, AI processing, CSV upload or schema change is required. A future local FastBill import should propose reviewable matches and field changes; this version implements only the issue overview, not that importer.

The compact organisation list and full detail view use the same phone-availability criteria, including secondary contacts. This avoids false missing-phone findings when the main number is incomplete but another usable number exists.
