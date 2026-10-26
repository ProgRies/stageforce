# Phone app (iPhone PWA)

Stage Force has a small phone app at `/m/` for logging a call while it is still running. It is a separate page with its own
code (`m/index.html`, `src/mobile/`) and stylesheet; the desktop page at `/` loads none of it and is unchanged.

## Install on the iPhone

1. Open `https://<your CRM address>/m/` in **Safari** (the address is also shown under Einstellungen → Handy-App).
2. Tap **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Open Stage Force from the home screen and sign in once with password and authenticator code.

An app added to the home screen keeps its own cookies, separate from Safari. Signing in inside Safari does not carry over:
sign in inside the installed app.

## Staying signed in

- The phone app gets a session of 90 days instead of the desktop's 7. Each day the app is used, the 90 days start again,
  so a phone in regular use does not ask for a code again.
- Each phone is listed under Einstellungen → Handy-App with its last use and can be signed out there (for example a lost phone).
- Phone sign-ins appear in Anmeldeaktivität as "Handy-App (iPhone)". The session is an HttpOnly, Secure cookie; the app's browser storage only
  keeps the display setting and a copy of an unsaved call note.

## Logging a call

1. The app opens on "Wer ruft an?". Type part of the name or organisation, or four or more digits of the number.
   Call-backs due today and the organisations you spoke to last are listed for one tap.
2. Pick the person. For a caller who is not in the CRM, tap **Neuer Lead** and enter the organisation, the caller's name
   and optionally the number.
3. Type the note. It is saved on the server as you type, so switching to the Phone app (iOS may restart the PWA) loses nothing.
4. Tap a result. **Gespräch geführt** logs the call and keeps the planned follow-up; the other results work as on the desktop.

Every organisation created from a call is listed in **Prüfen** ("Neu aus Anruf angelegt · Daten prüfen") until someone
checks its data at the desk, like a call that needs an email.

An iPhone web app cannot read the caller's number or the call log, so the caller is chosen by hand.
