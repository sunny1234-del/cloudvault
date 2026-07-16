// CloudVault — configuration template
//
// This file IS committed to git — it's just a template with placeholders.
// Copy it to `config.js` (which is gitignored) and fill in your project's
// real values there. `config.js` is what index.html actually loads.
//
//   cp config.example.js config.js
//
// Note: the Supabase anon key is designed to be public — it's meant to be
// embedded in client-side code. Row Level Security policies (see
// storage-isolation-policies.sql) are what actually protect the data behind
// it, not keeping this key secret. `config.js` is still kept out of git
// mainly so nobody accidentally commits a *different* project's real keys
// on top of a shared template, and so each environment (dev/staging/prod)
// can point at its own Supabase project without touching tracked files.

window.CLOUDVAULT_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
};
