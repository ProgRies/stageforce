/** Stage Force: explicit, read-only capture of ONE selected Gmail message.
 * No triggers watch the inbox. No mail is sent, drafted, marked read or changed.
 * Replace this example origin AND the three origin entries in appsscript.json together.
 */
const CRM_ORIGIN = 'https://crm.example.com';
const KEY_PROPERTY = 'stageforceCaptureKey';

function paragraph(text) {
  return CardService.newTextParagraph().setText(escapeHtml(text).replace(/\n/g, '<br>'));
}
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function button(text, handler, parameters, primary) {
  const action = CardService.newAction().setFunctionName(handler);
  if (parameters) action.setParameters(parameters);
  const result = CardService.newTextButton().setText(text).setOnClickAction(action);
  if (primary) result.setTextButtonStyle(CardService.TextButtonStyle.FILLED).setBackgroundColor('#6851bb');
  return result;
}
function card(section, title, step) {
  const header = CardService.newCardHeader().setTitle(title || 'Stage Force');
  if (step) header.setSubtitle(step);
  return CardService.newCardBuilder().setHeader(header).addSection(section).build();
}
function response(nextCard, notice) {
  const result = CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(nextCard));
  if (notice) result.setNotification(CardService.newNotification().setText(notice));
  return result.build();
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
  if ([400,403,404,409].indexOf(status) !== -1) {
    let message = ''; try { message = JSON.parse(result.getContentText()).message; } catch (_) {}
    if (typeof message === 'string' && message.length < 400) throw safeError(message);
  }
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
    section.addWidget(paragraph(hasMessage ? 'Organisation und Kontakte prüfen, dann im CRM speichern. Anhänge bleiben in Gmail.' : 'Öffne eine empfangene oder gesendete Nachricht, um sie zu übernehmen.'));
    if (hasMessage) section.addWidget(button('E-Mail zuordnen', 'captureMessage', null, true));
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
    if (account.sidebarReview) {
      const importId = result.reviewUrl.split('import=')[1];
      const preview = callCrm('review', token, {action:'preview', importId:importId});
      if (preview.saved) return response(savedCard(preview));
      const state = {flow:Utilities.getUuid(), importId:importId, gmailId:payload.gmailId, mailbox:currentMailbox,
        date:preview.date, direction:preview.direction, bodyMode:'cleaned', summary:'', contacted:preview.contacted,
        contactEmails:[], step:1};
      saveFlow(state);
      return response(organisationCard(state, preview));
    }
    const section = CardService.newCardSection().addWidget(paragraph('Vorgemerkt. Im CRM prüfen. Für die Prüfung direkt in Gmail: im CRM einen neuen Schlüssel erstellen und hier neu verbinden.'));
    section.addWidget(CardService.newTextButton().setText('Im CRM prüfen').setOpenLink(CardService.newOpenLink().setUrl(result.reviewUrl).setOpenAs(CardService.OpenAs.FULL_SIZE)));
    return response(card(section));
  } catch (error) { return notifyError(error); }
}

// Review state contains choices only, never message bodies or authentication keys.
// User cache is isolated per Google user and per review card; eviction fails closed.
function saveFlow(state) {
  CacheService.getUserCache().put('review:' + state.flow, JSON.stringify(state), 3600);
}
function loadFlow(e) {
  const params = (e.commonEventObject && e.commonEventObject.parameters) || e.parameters || {};
  const raw = CacheService.getUserCache().get('review:' + params.flow);
  if (!raw) throw safeError('Prüfung abgelaufen. Die E-Mail erneut zuordnen; unbestätigte Nachrichten bleiben 24 Stunden im CRM.');
  const state = JSON.parse(raw);
  if (state.mailbox !== mailbox()) throw safeError('Bitte mit dem ursprünglichen Google-Konto prüfen.');
  if (e.gmail && e.gmail.messageId && e.gmail.messageId !== state.gmailId) throw safeError('Die geöffnete E-Mail wurde gewechselt. Bitte „E-Mail zuordnen“ erneut anklicken.');
  return state;
}
function formValues(e, name) {
  const value = e.commonEventObject && e.commonEventObject.formInputs && e.commonEventObject.formInputs[name];
  return value && value.stringInputs ? value.stringInputs.value || [] : [];
}
function formValue(e, name, fallback) {
  const values = formValues(e, name); return values.length ? String(values[0]) : (fallback || '');
}
function reviewCall(state, action, extra) {
  return callCrm('review', PropertiesService.getUserProperties().getProperty(KEY_PROPERTY), Object.assign({
    action:action, importId:state.importId, id:state.id || '', date:state.date,
    bodyMode:state.bodyMode, page:state.page || 0
  }, extra || {}));
}
function flowButton(text, handler, state, extra, primary) {
  return button(text, handler, Object.assign({flow:state.flow}, extra || {}), primary);
}
function webButton(text, url) {
  // Only application-owned review/organisation links; never put keys into URLs.
  if (url.indexOf(CRM_ORIGIN + '/?') !== 0) throw safeError('Ungültiger CRM-Link.');
  return CardService.newTextButton().setText(text).setOpenLink(CardService.newOpenLink().setUrl(url).setOpenAs(CardService.OpenAs.FULL_SIZE));
}
function fallbackButton(state) { return webButton('Im CRM weiterbearbeiten', CRM_ORIGIN + '/?import=' + encodeURIComponent(state.importId)); }
function savedCard(result) {
  const section = CardService.newCardSection().addWidget(paragraph(result.organisation.name));
  section.addWidget(paragraph(result.duplicate || result.alreadySaved ? 'Bereits im Verlauf. Keine zweite E-Mail angelegt.' : 'E-Mail und ausgewählte Kontakte gespeichert.'));
  section.addWidget(webButton('Organisation öffnen', result.organisationUrl));
  return card(section, 'Gespeichert ✓');
}
function organisationCard(state, p, results) {
  if (p.saved) return savedCard(p);
  const section = CardService.newCardSection().addWidget(paragraph(p.subject || '(Ohne Betreff)'));
  if (state.newMode) {
    section.addWidget(CardService.newTextInput().setFieldName('newName').setTitle('Organisation').setValue(state.newOrganisation ? state.newOrganisation.name : p.suggestedName));
    section.addWidget(CardService.newSelectionInput().setFieldName('newStatus').setTitle('Status').setType(CardService.SelectionInputType.RADIO_BUTTON)
      .addItem('Lead', 'Lead', !state.newOrganisation || state.newOrganisation.status !== 'Kunde')
      .addItem('Kunde · Zahlungspflicht bestätigt', 'Kunde', !!state.newOrganisation && state.newOrganisation.status === 'Kunde'));
    section.addWidget(flowButton('Weiter', 'selectOrganisation', state, {newOrganisation:'true'}, true));
    section.addWidget(flowButton('Vorhandene Organisation', 'showOrganisations', state));
  } else {
    const best = state.id || p.bestId;
    const items = results || p.candidates;
    const candidate = items.find(function(o) { return o.id === best; }) || (best ? {id:best,name:p.organisation ? p.organisation.name : 'Zugeordnete Organisation'} : null);
    if (candidate && !state.searching) {
      section.addWidget(paragraph(candidate.name));
      if (p.existing) section.addWidget(paragraph('Diese E-Mail ist bereits importiert. Nur deinen Quellverweis ergänzen.'));
      section.addWidget(flowButton('Stimmt · weiter', 'selectOrganisation', state, {id:best}, true));
    }
    if (!p.existing) {
      if (state.searching || !candidate) {
        const action = CardService.newAction().setFunctionName('suggestOrganisations').setParameters({flow:state.flow});
        section.addWidget(CardService.newTextInput().setFieldName('orgSearch').setTitle('Organisation suchen').setValue(state.query || '').setSuggestionsAction(action)
          .setOnChangeAction(CardService.newAction().setFunctionName('searchOrganisations').setParameters({flow:state.flow})));
        if (results && !results.length) section.addWidget(paragraph('Keine Organisation gefunden. Suche ändern oder neu anlegen.'));
        items.slice(0,8).forEach(function(o) { section.addWidget(flowButton(o.name + (o.city ? ' · ' + o.city : ''), 'selectOrganisation', state, {id:o.id})); });
        section.addWidget(flowButton('Suchen', 'searchOrganisations', state));
      } else section.addWidget(flowButton('Andere Organisation', 'showOrganisations', state));
      section.addWidget(flowButton('+ Neue Organisation', 'showNewOrganisation', state));
    }
  }
  section.addWidget(fallbackButton(state));
  return card(section, 'Organisation', '1 / 3');
}
function showOrganisations(e) {
  try { const s=loadFlow(e);s.newMode=false;s.searching=true;s.step=1;saveFlow(s);return response(organisationCard(s,reviewCall(s,'preview'))); } catch(error) { return notifyError(error); }
}
function showNewOrganisation(e) {
  try { const s=loadFlow(e);s.newMode=true;s.step=1;saveFlow(s);return response(organisationCard(s,reviewCall(s,'preview'))); } catch(error) { return notifyError(error); }
}
function suggestOrganisations(e) {
  try {
    const s=loadFlow(e),query=formValue(e,'orgSearch');
    const data=reviewCall(s,'search',{query:query});
    const names=[...new Set((data.items || []).map(function(o) {return o.name;}))];
    return CardService.newSuggestionsResponseBuilder().setSuggestions(CardService.newSuggestions().addSuggestions(names)).build();
  } catch (_) { return CardService.newSuggestionsResponseBuilder().setSuggestions(CardService.newSuggestions()).build(); }
}
function searchOrganisations(e) {
  try {
    const s=loadFlow(e);s.query=formValue(e,'orgSearch');s.searching=true;s.newMode=false;saveFlow(s);
    const data=reviewCall(s,'search',{query:s.query});
    if(data.saved)return response(savedCard(data));
    return response(organisationCard(s,reviewCall(s,'preview'),data.items));
  } catch(error) { return notifyError(error); }
}
function selectOrganisation(e) {
  try {
    const s=loadFlow(e),params=(e.commonEventObject && e.commonEventObject.parameters)||e.parameters||{};
    const previous=s.id || JSON.stringify(s.newOrganisation);
    if(params.newOrganisation==='true') {
      const name=formValue(e,'newName').trim();if(!name||name.length>500)throw safeError('Bitte einen Organisationsnamen eingeben (maximal 500 Zeichen).');
      s.newOrganisation={name:name,status:formValue(e,'newStatus','Lead')};s.id='';
    } else {s.id=params.id;delete s.newOrganisation;}
    const p=reviewCall(s,'context');if(p.saved)return response(savedCard(p));
    s.version=p.organisation ? p.organisation.version : '';
    s.name=p.organisation ? p.organisation.name : s.newOrganisation.name;
    if(previous!==(s.id||JSON.stringify(s.newOrganisation))||!s.contactsChosen) s.contactEmails=p.participants.filter(function(a){return !a.internal&&a.role!=='quoted';}).map(function(a){return a.email;});
    s.step=p.existing?3:2;saveFlow(s);
    return response(p.existing ? placementCard(s,p) : contactsCard(s,p));
  } catch(error) { return notifyError(error); }
}
function contactsCard(s,p) {
  const section=CardService.newCardSection().addWidget(paragraph(s.name));
  if(p.participants.length>80) {
    section.addWidget(paragraph('Viele Beteiligte: Bitte diese Nachricht im CRM prüfen.'));
  } else {
    if(p.participants.length) {
      const people=CardService.newSelectionInput().setFieldName('contacts').setTitle('Gehören zur Organisation').setType(CardService.SelectionInputType.CHECK_BOX);
      p.participants.forEach(function(a){people.addItem((a.name ? a.name+' · ' : '')+a.email+' · '+(a.known?'vorhanden':a.internal?'eigenes Team':a.role==='quoted'?'zitiert':'neu'),a.email,s.contactEmails.indexOf(a.email)!==-1);});
      section.addWidget(people);
      section.addWidget(paragraph('Abwählen, wer nicht dazugehört. Vorhandene Kontakte bleiben erhalten.'));
    } else section.addWidget(paragraph('Keine Kontakte erkannt.'));
    section.addWidget(flowButton('Weiter', 'confirmContacts', s, null, true));
  }
  section.addWidget(flowButton('Zurück', 'showOrganisations', s));section.addWidget(fallbackButton(s));
  return card(section,'Kontakte','2 / 3');
}
function confirmContacts(e) {
  try {const s=loadFlow(e);s.contactEmails=formValues(e,'contacts');s.contactsChosen=true;s.step=3;saveFlow(s);return response(placementCard(s,reviewCall(s,'context')));} catch(error) {return notifyError(error);}
}
function captureReviewFields(e,s) {
  const inputs=(e.commonEventObject && e.commonEventObject.formInputs)||{};
  if(inputs.summary)s.summary=formValue(e,'summary');
  if(s.summary.length>2000)throw safeError('Die Kurznotiz darf höchstens 2.000 Zeichen enthalten.');
  if(inputs.direction)s.direction=formValue(e,'direction',s.direction);
  if(inputs.mailDate && inputs.mailDate.dateInput) {
    const date=new Date(Number(inputs.mailDate.dateInput.msSinceEpoch));
    if(isNaN(+date))throw safeError('Datum prüfen.');s.date=date.toISOString().slice(0,10);
  }
  if(inputs.contactCount)s.contacted=formValue(e,'contactCount')==='yes';
}
function placementCard(s,p) {
  if(p.saved)return savedCard(p);
  const section=CardService.newCardSection().addWidget(paragraph(s.name));
  section.addWidget(paragraph(p.subject || '(Ohne Betreff)'));
  if(p.existing) {
    section.addWidget(paragraph('Bereits gespeichert · '+p.date+'. Bestehender Text und Kontakte bleiben unverändert.'));
  } else {
    if(p.organisation && s.version!==p.organisation.version) {
      section.addWidget(paragraph('Die Organisation wurde inzwischen geändert. Bitte Zuordnung und Kontakte erneut prüfen.'));
      section.addWidget(flowButton('Erneut prüfen','showOrganisations',s));section.addWidget(fallbackButton(s));return card(section,'Erneut prüfen');
    }
    section.addWidget(CardService.newDatePicker().setFieldName('mailDate').setTitle('Datum').setValueInMsSinceEpoch(Date.parse(s.date+'T00:00:00Z')));
    section.addWidget(CardService.newSelectionInput().setFieldName('direction').setTitle('E-Mail').setType(CardService.SelectionInputType.DROPDOWN)
      .addItem('Erhalten','incoming',s.direction==='incoming').addItem('Gesendet','outgoing',s.direction==='outgoing'));
    if(p.position) {
      if(p.position.before)section.addWidget(paragraph('↑ '+p.position.before.date+' · '+p.position.before.title));
      section.addWidget(paragraph('● '+s.date+' · '+(p.position.position===1?'Neuester Kontakt':'Position '+p.position.position+' von '+p.position.total)));
      if(p.position.after)section.addWidget(paragraph('↓ '+p.position.after.date+' · '+p.position.after.title));
    }
    if(p.removed)section.addWidget(paragraph(s.bodyMode==='original'?'Vollständiger Nachrichtentext gewählt.':'Zitate/Signatur gekürzt. Bitte mit der E-Mail links vergleichen.'));
    section.addWidget(paragraph(p.excerpt || '(Kein Nachrichtentext)'));
    if(p.pages>1) {
      section.addWidget(paragraph('Textvorschau '+(p.page+1)+' / '+p.pages+' · gespeichert wird der vollständige gewählte Text.'));
      if(p.page>0)section.addWidget(flowButton('Vorheriger Textabschnitt','changeReview',s,{page:String(p.page-1)}));
      if(p.page+1<p.pages)section.addWidget(flowButton('Nächster Textabschnitt','changeReview',s,{page:String(p.page+1)}));
    }
    if(p.removed)section.addWidget(flowButton(s.bodyMode==='original'?'Gekürzten Text verwenden':'Vollständigen Text verwenden','changeReview',s,{bodyMode:s.bodyMode==='original'?'cleaned':'original'}));
    section.addWidget(CardService.newTextInput().setFieldName('summary').setTitle('Kurznotiz (optional)').setValue(s.summary).setMultiline(true));
    section.addWidget(CardService.newSelectionInput().setFieldName('contactCount').setTitle('Als Kontakt zählen').setType(CardService.SelectionInputType.DROPDOWN)
      .addItem('Ja','yes',s.contacted).addItem('Nein','no',!s.contacted));
  }
  section.addWidget(flowButton(p.existing?'Quellverweis ergänzen':'Im CRM speichern','saveReviewedEmail',s,null,true));
  section.addWidget(flowButton('Zurück','backToContacts',s));section.addWidget(fallbackButton(s));
  s.previewDate=s.date;saveFlow(s);
  return card(section,'Prüfen & speichern','3 / 3');
}
function changeReview(e) {
  try {
    const s=loadFlow(e);captureReviewFields(e,s);
    const params=(e.commonEventObject&&e.commonEventObject.parameters)||e.parameters||{};
    if(params.bodyMode){s.bodyMode=params.bodyMode;s.page=0;}else if(params.page)s.page=Number(params.page);
    saveFlow(s);return response(placementCard(s,reviewCall(s,'context')));
  } catch(error) {return notifyError(error);}
}
function backToContacts(e) {
  try {const s=loadFlow(e);captureReviewFields(e,s);saveFlow(s);const p=reviewCall(s,'context');if(p.saved)return response(savedCard(p));return response(p.existing?organisationCard(s,p):contactsCard(s,p));}catch(error){return notifyError(error);}
}
function saveReviewedEmail(e) {
  try {
    const s=loadFlow(e);captureReviewFields(e,s);
    if(s.date!==s.previewDate) {saveFlow(s);return response(placementCard(s,reviewCall(s,'context')),'Datum geändert. Position prüfen und erneut speichern.');}
    const result=reviewCall(s,'confirm',{
      confirmed:true,version:s.version,newOrganisation:s.newOrganisation,contactEmails:s.contactEmails,
      summary:s.summary,direction:s.direction,contacted:s.contacted
    });
    // Keep choices briefly so a retry after a lost response can return the same receipt.
    saveFlow(s);return response(savedCard(result));
  } catch(error) {return notifyError(error);}
}
