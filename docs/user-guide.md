# Working in the CRM

This page describes the CRM at `/`. The question mark in the sidebar starts a short in-app tour of the same things. For Gmail see [Browser extension](extension-setup.md), for the iPhone see [Phone app](mobile-app.md).

Everyone on the team sees and edits the same data. There are no per-organisation permissions.

## Organisations

The sidebar switches between **Organisationen**, **Anrufe** (your call list), **Prüfen** and **Importe**. The list searches names, places, contacts and the full text of the timeline. If an organisation is missing, create it straight from the search results; the form warns about similar existing names.

The header of an organisation holds:

- **Status**: Kunde, Lead or Partner / Agentur. Kunde means a confirmed obligation to pay. Nothing sets it automatically; FastBill imports only set it for new organisations with a real invoice (see [FastBill import](fastbill-import.md)).
- **Zuständig**: the colleague who owns the organisation, or nobody. Only the owner gets it on their call list.
- The **FastBill** link to the customer page, with a pencil to edit it.

Status and Zuständig save as soon as you pick them.

The right column holds the contacts, linked organisations (for example the agency that looks after a client), **In Gmail suchen** (opens your Gmail with a search for this organisation and its contact addresses; the CRM itself reads no mail), the organisation notes, the map pin, and **Organisation verwalten** for merging a duplicate into another organisation or deleting one created by mistake.

Organisation notes are saved with **Speichern**. An unsaved draft stays in this browser tab, even across reloads, until you save it.

**Weitere Angaben** appears only on older records and shows their former next-step and review notes. **Änderungsprotokoll** lists every edit with author and time, and **Quellen** shows where imported data came from.

### Contacts

The pencil on a contact edits its name, role, email addresses and phone numbers inside the card. Separate several addresses or numbers with semicolons. German numbers are stored as +49. The two contacts with the latest email or call are shown first; the rest expand on request.

To take a contact from an email, select the person's details in the opened email and choose **Kontakt extrahieren**. Review the suggestion, then save it as a new contact or add it to an existing one.

## The timeline

The newest entry is on top: emails (blue), calls (purple), meetings and notes (amber). A closed email card names the sender and shows the first lines of the email on one line. Open a card for the full text. Emails show their envelope and the contacts they were saved with. Calls, notes and meetings have a pencil to correct them; the date, author and linked contacts stay, and the edit lands in the change log.

**Notiz hinzufügen** records a note or a meeting. A note never counts as client contact. A meeting does, once its day has come.

### Meetings

Choose Meeting in **Notiz hinzufügen** to record one. A date up to two years ahead plans it ("Meeting planen"). A planned meeting:

- shows **Geplant** on its card and a **Nächstes Meeting …** line above the timeline,
- shows a chip such as "Meeting morgen" next to the organisation in the lists,
- keeps the organisation off new call lists until it has taken place or is cancelled.

The pencil on a meeting changes its date or marks it **Abgesagt** (shown struck through). Meetings also come in from Gmail: the extension recognises video-call invitations and booking confirmations, and a cancellation email marks the meeting as cancelled.

## Calls

Tap a contact's phone number, or the white phone button beside **Notiz hinzufügen**, which calls the most recently contacted person who has a number. The CRM saves the organisation and contact first and then opens your calling app through a `tel:` link (on a Mac, iPhone calls via Continuity).

The call then lives in the **call card**. In Chrome it is a small window that floats above every tab and app (Picture-in-Picture); move it to a corner once and Chrome remembers the spot. Elsewhere it sits in the top-right corner of the page. The card has the note field, **Wähl-App erneut öffnen**, the results, minimise and discard. The note is saved on the server as you type, so a closed tab loses nothing; the CRM or the Gmail popup shows the open call again until you save or discard it. Calls left open for more than 12 hours count as abandoned.

After the call, pick the **Ergebnis**, check the **Nächster Anruf** dropdown, then press **Speichern**. The CRM card, the Gmail card, **Notiz hinzufügen → Anruf** and the phone app all offer the same choice:

| Ergebnis | Next call preselected | Also |
| --- | --- | --- |
| Gespräch geführt | nothing (you pick) | |
| Nicht erreicht | in 2 days | does not count as contact |
| Termin vereinbart | in 2 weeks | a lead moves to the phase Termin vereinbart; shows a link to the booking page |
| E-Mail nötig | in 1 week | puts the organisation on Prüfen |

A planned call still ahead is preselected as **Unverändert · …** instead, so a result keeps it unless you pick something else. A call that was due today or earlier has no **Unverändert**: pick when the organisation comes back (In 2 Tagen to In 1 Jahr, each with its date, or **Datum und Uhrzeit wählen …**), or **Kein Anruf planen**. For a "no", pick Gespräch geführt and 1 Jahr.

Results only move the phase forward: a customer at Gewonnen, or a lead at Angebot or Testphase, keeps its phase. A next step written by hand (such as "Preisliste schicken, dann nachfassen") stays when the date changes; only the results' own wording ("Erneut anrufen") is replaced. Every result except Nicht erreicht counts as the last contact. Only one call per person is open at a time.

### Next planned call

Every organisation has at most one planned call. It shows as a chip next to the status in the list (**Anruf Do., 28.01.27**, amber once it is due; a planned meeting is shown instead) and as a button next to **Zuständig** on the organisation (or **Kein Anruf geplant**). Click the button to see who set it and how, pick 1 Woche to 1 Jahr or a date, or remove it. When you log a call by hand with **Notiz hinzufügen → Anruf**, pick its result and the next call there too, as on the call card.

A planned call can also have a time (optional): in the button's editor, and next to the date once a next call is picked after a call. Picking a new date without a time clears the old time.

### Follow-ups

**Follow-ups** (below Anrufe) shows one week, Monday to Sunday, with the arrows (or ← →) to page and **Heute** to come back. It only shows what is in the CRM:

- your planned calls, for organisations where you are **Zuständig**. Calls with a time are placed at their time; calls without one are listed first on their day.
- everyone's meetings in green, yours filled and colleagues' outlined with their name.
- calls that are overdue wait on today in amber with their original date (**fällig seit 24.10.**), until a logged call or an edit moves the date. There is nothing to tick off: logging the call sets the next date, as on the call card.

Click any entry to open its organisation.

### Call list

**Anrufe** builds your list for today. Due follow-ups always come first. Then come customers you have not spoken to for a chosen time (30 to 365 days), leads in progress (Angebot, Testphase, Termin vereinbart, Im Gespräch), and new leads. You choose the number of calls, the contact pause and the split between customers and leads.

The list only takes organisations you own or nobody owns, and none that a colleague already has on today's list. The first saved call to an unowned organisation makes the caller its owner. After each result the next organisation opens. Skipped entries can be brought back with **Zurückholen**.

## Prüfen

**Prüfen** collects organisations that need something done by hand. Each row says what is open and shows the latest timeline entry with date and author.

| Point | Comes from | Goes away |
| --- | --- | --- |
| E-Mail senden | a call with **E-Mail nötig** | when an outgoing email to the organisation is saved, or with **Erledigt** |
| Neu aus Anruf angelegt · Daten prüfen | an organisation created in the phone app | **Erledigt** |
| E-Mail-Adresse fehlt (FastBill-Import) | a FastBill customer added without an email address | **Erledigt** |

**Erledigt** in the organisation view closes all open points and records that in the change log.

## Map

**Pin auf Karte setzen** at the bottom of the right column opens the map. Search a place (it starts with the organisation's town) or click the map, drag the pin to the right spot and save. Once a pin is set, a small preview shows it; click it for the full map with all other pinned organisations. Hover a pin for its name and click **Öffnen** to jump there. **Pin ändern** moves or removes the pin.

Map tiles and the place search go through the CRM server, so your browser never contacts the map provider.

## Imports

**Importe** has two sources:

- **FastBill**: customer CSV exports or the API, reviewed one row at a time. See [FastBill import](fastbill-import.md).
- **E-Mail (.eml)**: for emails that are not in your Gmail, for example from another mailbox. Download the message as an .eml file and drop up to ten files here. The review asks for the organisation, the contacts to link and the date, then saves the email to the timeline. Unconfirmed uploads are kept for 24 hours. For Gmail, use the browser extension instead.

## Live updates

Open tabs update on their own within about a second when a colleague saves something. While you are typing, have a dialog open or are on a call, the update waits so your input is never replaced. If someone changed the organisation you are editing, a notice says so and saving reports the conflict instead of overwriting. The dot next to **Aktualisieren** in the settings shows **Live** or **Veraltet**.

## Settings (gear)

| Section | What it does |
| --- | --- |
| Darstellung | Hell, Dunkel or System. The extension popup follows the same choice. |
| Browser-Erweiterung verbinden | Creates, replaces or revokes your extension key. Creating one asks for a fresh authenticator code. Keys expire after 90 days. |
| Passwort ändern | Changes your password with your current one. Your other sessions, including phones, are signed out. |
| Handy-App | The address of the phone app and the list of signed-in phones, each with sign-out. |
| Anmeldeaktivität | Your own sign-ins, wrong passwords and codes, and key changes of the last 90 days. |

## Signing in

Every sign-in needs your password and a six-digit code from your authenticator app. **Kein Zugriff auf die App?** accepts one of your recovery codes instead; each works once. After five wrong codes you start again with the password. If you get a starting password from the administrator, you choose your own right after the first sign-in.

If wrong passwords or codes were entered for your account since your last sign-in, the first screen tells you. Wrong codes mean someone knew your password: change it.

Lost your phone and your recovery codes, or forgot your password? Ask the administrator (see [Accounts](deployment.md#accounts)).
