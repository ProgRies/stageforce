/** Stage Force: explicit, read-only capture of ONE selected Gmail message.
 * No triggers watch the inbox. No mail is sent, drafted, marked read or changed.
 * Replace this example origin AND the three origin entries in appsscript.json together.
 */
const CRM_ORIGIN = 'https://crm.example.com';
const KEY_PROPERTY = 'stageforceCaptureKey';

function paragraph(text) {
  return CardService.newTextParagraph().setText(escapeHtml(text));
}
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function button(text, handler) {
  return CardService.newTextButton().setText(text).setOnClickAction(CardService.newAction().setFunctionName(handler));
}
function card(section) {
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle('Stage Force')).addSection(section).build();
}
function response(nextCard) {
  return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(nextCard)).build();
}
function notifyError(error) {
  // Never log request data, keys, email contents or platform exceptions.
  return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(error.safeMessage || 'Verbindung fehlgeschlagen. HTTPS-Adresse, Freigaben und Schlüssel prüfen; anschließend erneut versuchen.')).build();
}
function safeError(message) {
  const error = new Error(message); error.safeMessage = message; return error;
}
function mailbox() {
  const address = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!address) throw safeError('Google-Konto nicht erkennbar. Bitte mit deinem Workspace-Konto öffnen und Berechtigungen bestätigen.');
  return address;
}
function callCrm(path, token, payload) {
  if (!/^https:\/\/[^/?#]+$/.test(CRM_ORIGIN)) throw safeError('Im Add-on muss eine HTTPS-Adresse ohne Pfad hinterlegt sein.');
  if (!/^sf_gmail_[A-Za-z0-9_-]{43}$/.test(token || '')) throw safeError('Bitte zuerst einen gültigen CRM-Schlüssel eintragen.');
  const result = UrlFetchApp.fetch(CRM_ORIGIN + '/api/integrations/gmail/' + path, {
    method: 'post', contentType: 'application/json', headers: {Authorization: 'Bearer ' + token},
    payload: JSON.stringify(payload), muteHttpExceptions: true, followRedirects: false,
    validateHttpsCertificates: true
  });
  const status = result.getResponseCode();
  if (status === 401) throw safeError('Schlüssel ungültig oder abgelaufen. Im CRM erneuern und hier neu verbinden.');
  if (status === 429) throw safeError('Bitte vorhandene Importe prüfen oder kurz warten und erneut versuchen.');
  if (status === 413) throw safeError('Nachricht zu groß. Bitte einen relevanten Abschnitt manuell im CRM erfassen.');
  if (status !== 200) throw safeError('CRM konnte die Nachricht nicht annehmen (HTTP ' + status + '). Adresse und Kontozuordnung prüfen.');
  const parsed = JSON.parse(result.getContentText());
  if (parsed.status !== 'success' || !parsed.data) throw safeError('Unerwartete CRM-Antwort.');
  return parsed.data;
}
function onHomepage() { return homeCard(false); }
function onGmailMessage() { return homeCard(true); }
function homeCard(hasMessage) {
  // Opening the sidebar neither reads nor transfers email contents.
  const section = CardService.newCardSection();
  const paired = !!PropertiesService.getUserProperties().getProperty(KEY_PROPERTY);
  if (!paired) {
    section.addWidget(paragraph('Im CRM: Zahnrad → Gmail verbinden → Schlüssel erstellen. Hier einmalig einfügen.'));
    section.addWidget(CardService.newTextInput().setFieldName('captureKey').setTitle('Verbindungsschlüssel'));
    section.addWidget(button('Verbinden', 'connectCrm'));
  } else {
    section.addWidget(paragraph('Verbunden für ' + mailbox()));
    section.addWidget(paragraph(hasMessage ? 'Nur die ausgewählte Nachricht wird zur Prüfung vorgemerkt. Anhänge bleiben in Gmail.' : 'Öffne eine empfangene oder gesendete Nachricht, um sie zu übernehmen.'));
    if (hasMessage) section.addWidget(button('Zur CRM-Prüfung übernehmen', 'captureMessage'));
    section.addWidget(button('Verbindung entfernen', 'disconnectCrm'));
  }
  return card(section);
}
function connectCrm(e) {
  try {
    const token = String(e.commonEventObject.formInputs.captureKey.stringInputs.value[0] || '').trim();
    const currentMailbox = mailbox();
    const account = callCrm('check', token, {});
    if (String(account.email).toLowerCase() !== currentMailbox) throw safeError('Dieser Schlüssel gehört zu einem anderen Konto. Google- und CRM-E-Mail müssen übereinstimmen.');
    PropertiesService.getUserProperties().setProperty(KEY_PROPERTY, token);
    return response(homeCard(!!(e.gmail && e.gmail.messageId)));
  } catch (error) { return notifyError(error); }
}
function disconnectCrm(e) {
  // Local unpairing only. Revoke the key in CRM settings to invalidate it everywhere.
  PropertiesService.getUserProperties().deleteProperty(KEY_PROPERTY);
  return response(homeCard(!!(e.gmail && e.gmail.messageId)));
}
function captureMessage(e) {
  try {
    if (!e.gmail || !e.gmail.accessToken || !e.gmail.messageId) throw safeError('Bitte eine einzelne Nachricht in Gmail öffnen und erneut klicken.');
    const token = PropertiesService.getUserProperties().getProperty(KEY_PROPERTY);
    const currentMailbox = mailbox();
    // Check pairing before reading or transmitting this message.
    const account = callCrm('check', token, {});
    if (String(account.email).toLowerCase() !== currentMailbox) throw safeError('Google- und CRM-Konto stimmen nicht überein. Bitte neu verbinden.');
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    const message = GmailApp.getMessageById(e.gmail.messageId);
    const text = message.getPlainBody();
    if (text.length > 500000) throw safeError('Nachricht über 500.000 Zeichen. Bitte einen relevanten Abschnitt manuell erfassen.');
    // No getThread(), getRawContent(), getAttachments(), or HTML/attachment bytes.
    const payload = {
      mailbox: currentMailbox, gmailId: message.getId(), messageId: message.getHeader('Message-ID'),
      from: message.getFrom(), to: message.getTo(), cc: message.getCc(),
      date: message.getDate().toISOString(), subject: message.getSubject(), text: text
    };
    const result = callCrm('import', token, payload);
    if (!new RegExp('^' + CRM_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/\\?import=[a-f0-9-]{36}$').test(result.reviewUrl || '')) throw safeError('Ungültiger Prüf-Link. Im CRM „E-Mail übernehmen“ öffnen.');
    const section = CardService.newCardSection().addWidget(paragraph('Vorgemerkt. Im CRM zuordnen, prüfen und speichern. Der Prüf-Link ist 24 Stunden verfügbar.'));
    section.addWidget(CardService.newTextButton().setText('Im CRM prüfen').setOpenLink(CardService.newOpenLink().setUrl(result.reviewUrl).setOpenAs(CardService.OpenAs.FULL_SIZE)));
    return response(card(section));
  } catch (error) { return notifyError(error); }
}
