PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_versions(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS organisations(
 id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name))>0),type TEXT NOT NULL DEFAULT 'Unklar',fastbill_url TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT '',website TEXT NOT NULL DEFAULT '',size REAL,size_unit TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'Lead',phase TEXT NOT NULL DEFAULT 'Unbearbeitet',owner TEXT NOT NULL DEFAULT '',last_contact TEXT,summary TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT '',legacy_json TEXT);
CREATE TABLE IF NOT EXISTS contact_addresses(id TEXT PRIMARY KEY,contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN ('email','phone')),value TEXT NOT NULL,position INTEGER NOT NULL DEFAULT 0,UNIQUE(contact_id,kind,value));
CREATE INDEX IF NOT EXISTS addresses_value ON contact_addresses(value COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS organisation_contacts(organisation_id TEXT NOT NULL REFERENCES organisations(id),contact_id TEXT NOT NULL REFERENCES contacts(id),is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),PRIMARY KEY(organisation_id,contact_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_primary ON organisation_contacts(organisation_id) WHERE is_primary=1;
CREATE TABLE IF NOT EXISTS followups(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),text TEXT NOT NULL DEFAULT '',due_date TEXT,owner TEXT NOT NULL DEFAULT '',completed_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_followup ON followups(organisation_id) WHERE completed_at IS NULL;
CREATE TABLE IF NOT EXISTS organisation_links(id TEXT PRIMARY KEY,a TEXT NOT NULL REFERENCES organisations(id),b TEXT NOT NULL REFERENCES organisations(id),note TEXT NOT NULL DEFAULT '',CHECK(a<>b),UNIQUE(a,b));
CREATE TABLE IF NOT EXISTS review_issues(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),text TEXT NOT NULL,resolved_at TEXT);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,dedupe_key TEXT NOT NULL UNIQUE,rfc_message_id TEXT,subject TEXT NOT NULL DEFAULT '',sender_json TEXT NOT NULL,recipients_json TEXT NOT NULL,sent_at TEXT,direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),body TEXT NOT NULL,attachments_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS message_sources(message_id TEXT NOT NULL REFERENCES messages(id),user_id TEXT NOT NULL REFERENCES users(id),mailbox TEXT NOT NULL,source_url TEXT NOT NULL DEFAULT '',PRIMARY KEY(message_id,user_id,mailbox));
CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),kind TEXT NOT NULL,occurred_on TEXT,created_at TEXT NOT NULL,author_id TEXT REFERENCES users(id),author_label TEXT,body TEXT NOT NULL DEFAULT '',is_contact INTEGER NOT NULL DEFAULT 0 CHECK(is_contact IN (0,1)),message_id TEXT REFERENCES messages(id),legacy_json TEXT);
CREATE INDEX IF NOT EXISTS activities_org_date ON activities(organisation_id,occurred_on DESC,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS activity_message ON activities(message_id) WHERE message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS source_references(id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),activity_id TEXT REFERENCES activities(id),contact_id TEXT REFERENCES contacts(id),payload_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log(id TEXT PRIMARY KEY,organisation_id TEXT REFERENCES organisations(id),user_id TEXT REFERENCES users(id),created_at TEXT NOT NULL,action TEXT NOT NULL,changes_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),organisation_id TEXT NOT NULL REFERENCES organisations(id),created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS email_imports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),payload_json TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS import_expiry ON email_imports(expires_at);
CREATE TABLE IF NOT EXISTS migrations(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,report_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS migration_archive(id TEXT PRIMARY KEY,organisation_id TEXT REFERENCES organisations(id),payload_json TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS search_docs USING fts5(organisation_id UNINDEXED,content,tokenize='unicode61 remove_diacritics 2');
INSERT OR IGNORE INTO schema_versions VALUES(1,datetime('now'));

CREATE TABLE IF NOT EXISTS gmail_keys(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_used_at INTEGER);
INSERT OR IGNORE INTO schema_versions VALUES(2,datetime('now'));
