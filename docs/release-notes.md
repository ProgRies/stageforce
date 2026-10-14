# Stage Force 0.1.4

## Review by issue type

**Prüfen** now shows issue categories in the middle panel and affected organisations on the right. Automatic checks are separated from topics in existing manual-review notes. Open a record, make corrections, and return to the same filtered list. Counts update after saving.

Counts represent distinct organisations, not individual tasks. Groups may overlap. Notes are routed by keywords without being rewritten, resolved or treated as verified facts; unclassified notes stay visible. No new missing-field requirements or automatic bulk changes were added.

Secondary contact numbers now count consistently in both the organisation list and detail view, avoiding false missing-phone warnings when the main number is incomplete.

## Update and test locally

```sh
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh the browser and open **Prüfen**. No data reimport or new database schema migration is needed from 0.1.3. Back up regularly; when upgrading from 0.1.2 or earlier, first follow the schema-upgrade backup instructions in [Gmail setup](https://github.com/ProgRies/stageforce/blob/main/docs/gmail-setup.md).

The existing Gmail and file-import flows remain available. FastBill CSV import is not included in this version.

Validation: 20 automated tests, TypeScript check and production build. New tests cover overlapping counts, preservation and fallback grouping of notes, field correction versus explicit note resolution, and consistent phone checks. Browser visual QA has not been performed in the development environment.

The versioned container is available only after successful release publication: `ghcr.io/progries/stageforce:0.1.4`.
