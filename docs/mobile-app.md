# Phone app (iPhone PWA)

StageForce has a small phone app at `/m/` for logging a call while it is still running. It is a separate page with its own
code (`m/index.html`, `src/mobile/`) and stylesheet; the desktop page at `/` loads none of it.

## Install on the iPhone

1. Open `https://<your CRM address>/m/` in **Safari** (the address is also shown under Einstellungen → Handy-App).
2. Tap **Teilen** → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Open StageForce from the home screen and sign in once with password and authenticator code.

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
4. Pick the result and the next call, then tap **Speichern**, as on the desktop call card.

Every organisation created from a call is listed in **Prüfen** ("Neu aus Anruf angelegt · Daten prüfen") until someone
checks its data at the desk, like a call that needs an email.

An iPhone web app cannot read the caller's number or the call log, so the caller is chosen by hand.

## Testing on your Mac and iPhone without deploying

The phone app needs a secure context: the service worker, "Zum Home-Bildschirm" as a real app, and the random IDs used
to start a call only work on `https://` or on `localhost`. A plain `http://192.168.x.x:3000` address from the iPhone
does not work, and the CRM also rejects requests whose origin differs from `APP_URL`.

### Quickest: iPhone Simulator on the Mac (no setup)

1. Start the CRM as usual (`docker compose -f compose.local.yaml up -d --build`) and install Xcode from the App Store.
2. Open **Xcode → Open Developer Tool → Simulator**, choose an iPhone, open Safari and go to `http://localhost:3000/m/`.
   The simulator shares the Mac's network, and `localhost` counts as secure, so everything works including
   **Teilen → Zum Home-Bildschirm**.
3. Debug with Mac Safari: **Settings → Advanced → Show features for web developers**, then **Develop → Simulator → localhost**.
   The installed home-screen app appears there too.

Use this for layout and flow. Keyboard, dark mode (Simulator: **Features → Toggle Appearance**) and safe areas behave like a
real iPhone; a real phone call during the flow does not.

### Real iPhone: Tailscale (HTTPS, nothing exposed to the internet)

1. Install [Tailscale](https://tailscale.com/download) on the Mac and the iPhone and sign in to the same account.
   In the Tailscale admin console, enable **MagicDNS** and **HTTPS certificates** (DNS page).
2. On the Mac, publish the local CRM inside your tailnet only:

   ```sh
   tailscale serve --bg 3000
   tailscale serve status   # shows https://<mac-name>.<tailnet>.ts.net
   ```

3. Restart the CRM with that address as its origin:

   ```sh
   LOCAL_APP_URL=https://<mac-name>.<tailnet>.ts.net docker compose -f compose.local.yaml up -d
   ```

   Compose still binds port 3000 to `127.0.0.1`; Tailscale forwards to it, so the CRM is not reachable from your Wi-Fi
   or the internet. While `LOCAL_APP_URL` is set, open the CRM on the Mac at the same `https://…ts.net` address too
   (`localhost` would be refused as a different origin).
4. On the iPhone, open `https://<mac-name>.<tailnet>.ts.net/m/` in Safari, add it to the home screen and sign in with
   your local account and authenticator code. Now take a real call and log it from the app.
5. Debug the phone from the Mac: on the iPhone **Settings → Apps → Safari → Advanced → Web Inspector** on, connect it by
   cable once, then **Mac Safari → Develop → <your iPhone>**.
6. Back to normal: `docker compose -f compose.local.yaml up -d` (without `LOCAL_APP_URL`) and `tailscale serve reset`.

After code changes, rebuild with `docker compose -f compose.local.yaml up -d --build` (keep `LOCAL_APP_URL=…` in front when testing on the
phone) then close the app in the app switcher and open it again; the service worker always fetches the page fresh.

A quick tunnel such as `cloudflared tunnel --url http://localhost:3000` also gives HTTPS, but it puts your local CRM on a
public address; prefer Tailscale.
