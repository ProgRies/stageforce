# Email integration

The Chrome extension in `integrations/chrome` is the Gmail integration. See [setup and security](extension-setup.md).

`POST /api/integrations/extension` accepts a personal bearer key `check`, `search`, `lookup`, `messageStatus`, explicit `save`, and `callPrepare` / `callSave` / `callCancel`. Lookup uses headers without persisting an email. Save commits the email, selected contacts, optional new organisations and relationship atomically to the same SQLite database used by the CRM UI.

Gmail Apps Script integration code and routes have been removed. Schema 6 drops its obsolete key table without removing CRM messages or contacts. The existing .eml file importer remains a separate manual CRM utility; it is not required by the extension.

Message status sends a mailbox, Gmail identifier and optionally an original-text hash, never the email body. Call preparation saves the selected organisation and contact before opening the local dialler. Saving notes creates the communication event; cancellation deletes the pending preparation while preserving the organisation/contact. Schema 7 adds `extension_message_refs` and `call_attempts`.
