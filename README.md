# CloudVault

Secure, per-user cloud storage dashboard — vanilla JavaScript frontend, Supabase (Auth + Storage) backend, no build step.

Sign in, upload files into a virtual folder structure, preview/download/organize them, and manage your account from a full Settings panel. Every account's files are isolated from every other account both at the database policy level and at the URL level.

---

## Features

- 🔐 **Auth** — email/password sign-up & sign-in, persistent sessions, global "sign out everywhere"
- 📁 **Virtual folders** — nested folders, breadcrumb navigation, grid/list view
- ⬆️ **Uploads** — multi-file, click-to-browse, drag-and-drop (including anywhere on the window)
- 🗑️ **Trash** — soft delete with restore, plus permanent delete
- ⭐ **Favorites & search** — instant search (`Ctrl/Cmd+K`), favorites saved locally
- 📊 **Live analytics** — file counts, storage usage, and a file-type breakdown chart
- ⚙️ **Settings** — change password, login activity, real "logout everywhere", Light/Dark/System theme, 3 accent colors, editable profile with photo upload
- 🔒 **Real per-user isolation** — Row Level Security policies + private bucket + short-lived signed URLs (see [Security model](#security-model))

## Tech Stack

Vanilla JS (ES6+) · HTML5 · CSS3 (custom properties) · [Supabase](https://supabase.com) (Auth + Storage) · [Chart.js](https://www.chartjs.org/)

No framework, no bundler, no `npm install` — three files talk directly to Supabase from the browser.

## Getting Started

1. Create a [Supabase](https://supabase.com) project and a Storage bucket named `vault-files`.
2. Run `storage-isolation-policies.sql` in the Supabase SQL Editor to set up per-user Row Level Security.
3. In the dashboard: **Storage → vault-files → Edit bucket → turn OFF "Public bucket"**. (This step can't be done via SQL — RLS alone does nothing while the bucket is public.)
4. Copy the config template and fill in your project's credentials:
   ```bash
   cp config.example.js config.js
   ```
   Then edit `config.js` with your Supabase project URL and anon key. (The anon key is meant to be public — RLS is what actually protects the data.)
5. Open `index.html` in a browser, or serve the folder with any static file server:
   ```bash
   npx serve .
   ```

That's it — no build step, no dependencies to install.

## Project Structure

```
cloudvault/
├─ index.html                        Markup — Auth screen, Dashboard, Settings
├─ style.css                         All styling & theme variants
├─ app.js                            Application logic
├─ config.example.js                 Committed template for credentials
├─ config.js                         Gitignored — your real credentials
├─ .gitignore
├─ storage-isolation-policies.sql    RLS policies + setup notes
├─LICENSE

```

## Security Model

- Every file lives under `{user_id}/...` in storage; a shared helper prefixes every request so no code path can reach another user's folder.
- Row Level Security policies enforce that same boundary at the database level — not just client-side convention.
- The bucket is private; every preview/download link is a short-lived signed URL generated on demand, not a permanent public link.

See **[DOCUMENTATION.md](./DOCUMENTATION.md)** for the full architecture write-up, known limitations, and setup checklist — and **[CHANGES.md](./CHANGES.md)** for the complete history of every fix and feature added during development.

## License

Add a license of your choice (MIT is a common default for a personal/portfolio project like this) — none is included yet.

