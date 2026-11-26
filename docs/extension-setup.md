# Browser extension for Gmail and Google Calendar

The Chrome extension in `integrations/chrome` (version 0.5.2) connects Gmail and Google Calendar to the CRM. It adds an **Add to StageForce** button to every opened email, saves the emails, contacts and meetings you confirm, and starts calls. In Google Calendar it shows in each event pop-up whether the meeting is in an organisation's timeline, logs it on request, and marks logged meetings in the calendar grid. Gmail stays your mailbox: the extension only acts when you click, and it talks to the CRM's API with your personal key. It needs no Google sign-in.

## Install and connect

1. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and select the `integrations/chrome` folder (the one with `manifest.json`). Pin the StageForce icon if you like.
2. In the CRM: gear → **Browser-Erweiterung verbinden** → **Schlüssel erstellen** (later **Neuen Schlüssel erstellen**). Give the computer a name, confirm with a fresh code from your authenticator app and copy the key. It is shown only once.
3. Click the extension's toolbar icon. Enter the CRM address (`https://stageforce.jaimo.me` on the server, `http://localhost:3000` locally) and the key, click **Connect** and allow access to that address.
4. Reload Gmail and Google Calendar.

Each colleague uses their own CRM account. Each computer gets its own key (up to 10 per account), listed by name with its expiry and last use: don't copy one key to several computers. The Gmail account must have the same address as the CRM account. Keys expire after 90 days; renewing or revoking a key disconnects only that computer immediately. A password reset, an authenticator reset or disabling the account disconnects all of them. A key only works against the CRM that issued it, so a local key does not work on the server.

To update the extension, replace the folder (for example with `git pull`), click the reload button in `chrome://extensions` and reload Gmail.

## Saving an email

Open an email and click **Add to StageForce** next to its date. The popup shows:

- **Organisation**: prefilled when the sender's address clearly belongs to one organisation, or when another email of the same Gmail conversation was saved before. Otherwise search for it, or type a new name to create it on save.
- **Contacts**: the people in the email header. External participants are ticked; colleagues (addresses on the company domains, aliases included) are never offered as client contacts. Phone numbers from the sender's signature appear as removable "new" chips.
- **Date and direction**: read from Gmail. The CRM decides whether it was sent or received. An email a colleague sent while you were in To or CC is saved from your mailbox as their sent email: the popup shows **Sent by …**, and the timeline shows "E-Mail gesendet von …" with you as the one who logged it.
- **Text**: the reply without its quoted history. **Include quoted history** keeps the full text for this email and also offers people and numbers from the earlier emails in the thread.
- **Other messages of the conversation** that are opened in Gmail and not yet in the CRM, ticked, so one save stores them all. Collapsed messages Gmail has never loaded cannot be read; use Gmail's "Expand all" first.

**Save & Continue** saves and closes the popup. **Save & Open** also opens the organisation in the CRM. Ctrl/Cmd+Enter is Save & Continue.

To add a person from the email body, select their details and choose **Extract contact**. The pencil on a contact edits its name and numbers; **Save contact** writes to the organisation right away, independent of saving the email.

### Already saved

An email that is in the CRM shows **Already in StageForce** instead. This also works for emails a colleague saved from their own mailbox: the copy is matched by sender, subject, the minute it was sent and a shared recipient, and the popup names who saved it. Opening a saved email shows the stored version; contacts can still be edited and calls started.

In the inbox list, a small **✓ CRM: Name** mark shows conversations whose latest email is already in the CRM, with the person Zuständig for that organisation. Your own organisations get a ring around the mark. An amber **! CRM: niemand zuständig** means nobody is assigned yet. Emails that are not in the CRM get no mark. The marks are checked again every minute, so a new owner shows up without reloading Gmail.

### Meetings

The popup always offers **Also log as meeting** with a date and time. It is ticked automatically for video-call invitations (Zoom, Teams, Google Meet, Webex, GoTo, Whereby, Jitsi, Skype) and for calendar or booking confirmations such as "Akzeptiert:", "Terminbestätigung" or Calendly's "New Event:". Several emails about the same meeting stay one timeline entry; an updated invitation moves it and a cancellation marks it **Abgesagt**. Declines and counter-proposals are ignored. Google Calendar and booking-tool notifications come from one shared address (such as calendar-notification@google.com), so that address never picks an organisation and is never offered as a contact: choose the organisation yourself.

## Google Calendar

Open an event in Google Calendar (calendar.google.com). Under its title, a StageForce row says one of:

- **✓ Logged in StageForce** with the organisation, date, time and contacts, and **Open ↗**. If the meeting was moved in the calendar after it was logged, the row says so and offers **Update**.
- **Not logged yet** when a guest is a saved contact of an organisation, with **Log meeting**.
- **No client among the guests** for everything else (birthdays, private and team events), with a quiet **Log anyway**.

**Log meeting** opens a card like the Gmail popup: the organisation (prefilled from the guests' addresses, or search and pick, or create a new one), title, date and time, and the guests as contacts. Guests who are not yet contacts of that organisation are created as contacts when ticked; you and your colleagues are never saved as contacts. The meeting lands in the timeline as a normal Meeting entry. Logging the same event again after it moved in the calendar moves that entry.

A meeting is recognised as already logged when it was logged from this calendar event (by any colleague, since everyone invited shares the event id), when it has the same video link as a meeting logged from its invitation email (Google Meet, Zoom, Teams, …), or when the guests' organisation has a meeting on that day at that time.

In the week, day and month grid, event boxes of logged meetings get a small white StageForce mark in their top-right corner. Boxes too small for it stay unmarked. A box is marked when its event was logged or recognised in the pop-up, or when a meeting with the same title is logged on that day at that time; so most meetings logged from Gmail invitations are marked without opening them.

## Calling from Gmail

Every contact phone number in the popup starts a call. The organisation and contact are saved first (a new organisation needs a name), then the calling app opens and the popup closes. The note and the result go into the same floating call card as in the CRM; see [Calls](user-guide.md#calls).

## What is sent, and when

- **Showing the button** sends the mailbox and Gmail's message id (and, for older saves, a SHA-256 fingerprint of the message) to check whether it is already saved. The inbox mark sends the latest email's sender, time and subject per conversation. Only yes or no comes back, so no client names enter the Gmail page.
- **Opening the popup** sends the header addresses and names for matching. Organisation searches send what you type. No email text leaves the browser yet, and nothing is stored.
- **Save** sends the reviewed text, subject, time, participants, chosen organisation and contacts, attachment names and sizes (never the files) and the full loaded text, which the CRM keeps beside the stored reply.
- **A call** sends the chosen organisation, contact and number, then the note as you type it.
- **Google Calendar boxes** send the visible events' ids, titles, days and start times, at most once a minute per event. Only the ids of logged ones come back.
- **Opening a calendar event** sends its id, title, date, time, the links in it and the guests' addresses and names, to find the organisation and the logged meeting. **Log meeting** sends the reviewed title, date, time, organisation and ticked guests. The event's description is never sent.

The extension never sends, drafts, forwards, deletes, labels or marks emails, and uses no external AI or analytics. Everything saved is visible to all active colleagues in the CRM.

## Security

- Network requests go through the extension's background worker. Only the extension's own settings page can set the CRM address and key. Gmail's page can ask only for fixed operations (matching, saving, calls), never arbitrary URLs. Google Calendar's page can only search organisations and check, log and mark meetings. Redirects are refused and no browser cookies are sent.
- Plain HTTP is allowed only for `localhost` and `127.0.0.1`; every other address must be HTTPS.
- The key is a random 256-bit token, stored on the server only as a hash. In Chrome it sits in `chrome.storage.local`, is not synced and is never visible to Gmail's page. Someone with access to your computer profile could still copy it, so use disk encryption and your own browser profile.
- The key cannot reach the rest of the CRM API, account settings or FastBill. It can only match, save confirmed emails and contacts, edit contacts of the selected organisation and handle its own user's calls.

## Limits

- Gmail's and Google Calendar's page structures are undocumented and can change. If Calendar changes, the pop-up row or the marks may stop appearing until the extension is updated; Calendar itself keeps working.
- Calendar dates are read from the event pop-up (German and English formats). If one is read wrongly, correct it in the card before logging.
- Gmail's page structure is undocumented and can change. Collapsed headers may hide recipients; expand them and reopen the popup.
- Dates in ISO, German numeric and spelled-out formats ("Mo., 20. Okt. 2026, 10:00", "Mon, Oct 20, 2026, 10:00 AM") are read in the browser's time zone. Other formats need a manual date.
- Recognising a colleague's copy needs both Gmail accounts in the same time zone and an unchanged subject.
- Duplicate detection uses Gmail ids and a content fingerprint, not the RFC Message-ID, so an email saved earlier via an .eml upload may not be recognised.
