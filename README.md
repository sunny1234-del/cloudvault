# CloudVault

Secure, per-user cloud storage dashboard — vanilla JavaScript frontend, Supabase (Auth + Storage) backend, no build step.

Sign in, upload files into a virtual folder structure, preview/download/organize them, and manage your account from a full Settings panel. Every account's files are isolated from every other account, enforced at the database level — not just by convention.

---

## Features

- 🔐 **Auth** — email/password sign-up & sign-in, persistent sessions, global "sign out everywhere"
- 📁 **Virtual folders** — nested folders, breadcrumb navigation, grid/list view toggle
- ⬆️ **Uploads** — multi-file, click-to-browse, drag-and-drop (including anywhere on the window)
- 🗑️ **Trash** — soft delete with restore, plus permanent delete
- ⭐ **Favorites & search** — instant search (`Ctrl/Cmd+K`), favorites saved locally
- 📊 **Live analytics** — file counts, storage usage, and a file-type breakdown chart
- ⚙️ **Settings** — change password, login activity, real "logout everywhere," Light/Dark/System theme, 3 accent colors, editable profile with photo upload
- 🔒 **Real per-user isolation** — Row Level Security + a private bucket + short-lived signed URLs (see [Security Model](#security-model))

## Tech Stack

Vanilla JS (ES6+) · HTML5 · CSS3 (custom properties) · [Supabase](https://supabase.com) (Auth + Storage) · [Chart.js](https://www.chartjs.org/)

No framework, no bundler, no `npm install` — a handful of files talk directly to Supabase from the browser.

## Getting Started

1. Create a [Supabase](https://supabase.com) project and a Storage bucket named `vault-files`.
2. Run `storage-isolation-policies.sql` in the Supabase SQL Editor to set up per-user Row Level Security.
3. In the dashboard: **Storage → vault-files → Edit bucket → turn OFF "Public bucket."** This step can't be done via SQL — the RLS policies do nothing while the bucket is public, since a public bucket serves files straight from the CDN with no auth check at all.
4. Copy the config template and fill in your project's credentials:
   ```bash
   cp config.example.js config.js
   ```
   Edit `config.js` with your Supabase project URL and anon key. The anon key is meant to be public — RLS is what actually protects the data behind it.
5. Open `index.html` in a browser, or serve the folder with any static file server:
   ```bash
   npx serve .
   ```

No build step, no dependencies to install.

## Project Structure

```
cloudvault/
├─ index.html                        Markup — Auth screen, Dashboard, Settings
├─ style.css                         All styling & theme variants
├─ app.js                            Application logic
├─ config.example.js                 Template for Supabase credentials
├─ config.js                         Your real credentials (safe to commit — see below)
├─ .gitignore
├─ storage-isolation-policies.sql    Row Level Security policies
├─ vercel.json                       Deployment config (see Deployment below)
├─ LICENSE
└─ README.md
```

## Security Model

- **Per-user storage isolation.** Every file lives under `{user_id}/...`; a single shared helper prefixes every storage request with the signed-in user's ID, so no code path can reach into another user's folder.
- **Enforced at the database, not just the client.** `storage-isolation-policies.sql` adds Row Level Security policies on `storage.objects` that restrict select/insert/update/delete to a user's own folder — this holds even against a modified or malicious client, not just the app trusting itself to behave.
- **No permanent public links.** The bucket is private. Every preview/download uses a short-lived signed URL generated on demand, and downloads are fetched as blobs to force an actual save-to-disk rather than opening inline in the browser.
- **The anon key is safe to expose.** It's designed to be public; RLS is what actually protects the data, not keeping this key secret.

## Deployment

Deployed via [Vercel](https://vercel.com). `vercel.json` tells Vercel the site lives at the repo root (no `public/` folder) — without it, Vercel assumes the static-build convention and fails with "No Output Directory named 'public' found":

```json
{
  "outputDirectory": "."
}
```

If your dashboard's own **Output Directory** field has anything typed into it, clear it — a manual dashboard value overrides `vercel.json`.

For any other static host (Netlify, GitHub Pages, etc.), just make sure `config.js` is included in what actually gets deployed.

## License

See [LICENSE](./LICENSE).