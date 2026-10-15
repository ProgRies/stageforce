# Stage Force 0.1.10

Opening the login page without an existing session no longer incorrectly displays “Sitzung abgelaufen”. A genuinely expired session during CRM use still returns the user to login, with a small neutral notice. Failed sign-in attempts retain a distinct, compact error message. Authentication and access checks are unchanged.

No database migration or repeat import is needed.

## Update

For the Mac installation using the `stageforce-real` Compose project, run separately, continuing only if the pull succeeds:

```sh
git pull --ff-only
docker compose -p stageforce-real -f compose.local.yaml up -d --build
```

If your installation uses the default project, omit `-p stageforce-real`. Refresh the browser afterward.

Regression tests cover unauthenticated session checks, invalid login credentials and expiry during protected CRM requests. Interactive browser verification remains outstanding.
