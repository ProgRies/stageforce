# StageForce Chrome extension · 0.4.8

Load this folder using Chrome → Extensions → Developer mode → Load unpacked.

Click the extension toolbar icon to pair it with your StageForce address and personal key. Create the key in StageForce settings under **Browser-Erweiterung verbinden**. For local testing use `http://localhost:3000`.

Refresh Gmail. Open one message and click **Add to StageForce** next to its timestamp, then **Save & Continue**. Clear matches are prefilled; new or ambiguous organisations need your choice. **Save & Open** opens the CRM record.

The body remains in memory until Save. Matching sends header participants to your configured CRM. Keys are stored locally, not synced or exposed to Gmail's content script. HTTPS is required except on localhost. No Google OAuth or Apps Script is used.

See `docs/extension-setup.md` in the full package for setup, security, shared access and Gmail extraction limits. Test actual received/sent messages, timestamps, quoted content and recipients before using it for real records.

Version 0.4.0 adds durable saved badges, a 75/25 popup, lazy long-email preview, isolated keyboard input, signature phone suggestions, attachment references, and calling with notes. Use CRM 0.3.0-local or newer. See `docs/update-local.md` for details.
