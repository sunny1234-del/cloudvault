# CloudVault — Change Log

Summary of everything changed between the original upload and the polished version, grouped by type. Backend contract (Supabase project, bucket name `vault-files`, folder/trash conventions, `localStorage` key `vault_favs`) was left untouched, so this drops in as a direct replacement for the old `index.html` / `style.css` / `app.js`.

## 1. Bugs fixed

| Issue | Before | After |
|---|---|---|
| Duplicated markup | `index.html` had the files grid, side column (upload/log/chart), and their IDs each repeated twice (a copy-paste/merge artifact). This causes duplicate-ID conflicts and unpredictable `getElementById` behavior. | Duplicate block removed; every ID in the document is now unique (verified programmatically). |
| Drag & drop advertised but not implemented | The UI showed a "drag files here" overlay and copy, but no `dragover`/`drop` listeners existed anywhere in `app.js`. | Full drag-and-drop wired up: dropping on the upload card, and dropping anywhere on the window while the dashboard is open (with a full-screen overlay that appears on drag-enter). |
| `Ctrl/Cmd+K` shortcut advertised but not implemented | Search bar showed a "(Ctrl+K)" hint with no keyboard listener behind it. | Global `keydown` listener focuses the search input on `Ctrl/Cmd+K`; `Escape` closes the preview modal or mobile sidebar. |
| Single-file upload only | `file-input` had no `multiple` attribute; only `fileInput.files[0]` was ever read. | Input now accepts multiple files; `uploadFiles()` loops through and uploads each, reporting a combined success toast. |
| Sidebar unreachable on mobile | Below 1024px the sidebar was set to `display:none` with no alternate nav — mobile users had no way to switch views. | Sidebar becomes a slide-in drawer with a hamburger button, close button, and background scrim; a floating "+" button also appears for quick uploads. |
| `alert()` used for all errors/confirmations | Native browser alerts for signup confirmation, folder-creation errors, upload errors. | Replaced with an in-app toast notification system (`showToast()`), except for the one destructive confirm (`permanently delete`) which intentionally keeps a native `confirm()`. |
| No loading/empty feedback | Grid was just blank during the first fetch and when a folder/trash/favorites view had nothing in it. | Added a loading message during first fetch, and context-aware empty states for: empty folder, no trash, no favorites, nothing shared, no search results. |
| No session persistence check | Refreshing the page always dropped the user back to the login screen even if their Supabase session was still valid. | `supabaseClient.auth.getSession()` is checked on load; if a valid session exists, the dashboard opens automatically. |

## 2. Visual redesign

The old look was a generic dark-mode SaaS template (near-black background, single blue accent glow) — the goal was to make it look purpose-built rather than templated.

- **New theme concept:** a physical bank-vault reimagined digitally. Warm charcoal background instead of pure black/blue; **brass/gold** (`#c9a15a`) as the primary accent standing in for a vault door, **teal** (`#4d9a90`) reserved for "secure/verified" states (encryption badge, sync timer, restore actions), muted rust-red for destructive actions.
- **Typography:** paired **Space Grotesk** (headings) + **Inter** (body) + **JetBrains Mono** (file sizes, percentages, security readouts) instead of a single system-font stack.
- **Signature element:** a rotating concentric "vault dial" motif — used as a subtle background animation on the login screen and repurposed as the drag-and-drop overlay's spinner, tying the metaphor together instead of being decoration.
- **Auth screen:** tab/button states, error messaging (`auth-error` banner instead of alert), and a disabled/"Unlocking…" state on the submit button while the request is in flight.
- **File/folder cards:** icons and extension badges recolored to the new palette; list-view layout cleaned up so the row doesn't visually break at narrow widths.
- **Consistent iconography:** emoji icons replaced with a small set of geometric glyphs (▤ ▧ ▥ ▩ etc.) for a more "engineered" look and more predictable rendering across platforms.

## 3. UX / interaction additions

- Toast notifications for upload success/failure, folder creation, restore, trash, and permanent delete.
- Full multi-file drag-and-drop, both on the dedicated upload card and anywhere on the window.
- Mobile navigation drawer with scrim and close button.
- Floating "+" action button appears on small screens for quick access to upload.
- Keyboard shortcuts: `Ctrl/Cmd+K` to search, `Esc` to close modal/drawer.
- Empty states with contextual copy per view instead of a blank grid.
- Session auto-resume on page reload.
- Visible focus states on all interactive elements for keyboard accessibility.
- `prefers-reduced-motion` respected — animations are disabled for users who request it at the OS level.

## 4. Code quality changes

- Removed all inline `style="..."` attributes from `index.html`; all styling now lives in `style.css` under semantic class names (`.greet-line`, `.file-card-top`, `.folder-card-label`, etc.).
- File names, folder names, and preview titles are now set via `textContent` instead of being interpolated into `innerHTML` strings — closes a stored-XSS style risk where a filename containing `<` or `"` could break out of the markup.
- Deduplicated repeated DOM lookups and consolidated the four delete/restore/favorite click-handler loops into direct listeners attached at card-creation time.
- Added a small `safeParseJSON()` helper so a corrupted `localStorage` value can't crash the app on load.

## 6. Settings view: bug fix + full panel (added after storage isolation)

**Bug fixed:** clicking "Settings" reused the same file-grid filtering logic as My Files/Trash/Favorites, and since no branch in that filter matched `'settings'`, it fell through to the default case and rendered the root folder's file/folder cards underneath the Settings title. `loadCloudFiles()` now checks for the Settings view immediately after refreshing cached stats and returns before any of that filtering runs, so the file grid, breadcrumbs, and toolbar are fully swapped out for a dedicated panel rather than merely hidden behind it.

**New Settings panel — left column (Preferences):**
- 🔒 **Security** — Change Password (real, calls Supabase `updateUser`), Login Activity (real, shows last sign-in and account-created timestamps from your session), Logout From All Devices (real, calls global sign-out and invalidates every session), Two-Factor Auth and Active Devices toggles are present but labeled as not-yet-wired-up rather than faking data, since both need additional Supabase configuration (MFA enrollment, device tracking) beyond this project's current setup.
- 🌙 **Theme** — Light / Dark / System is a real, working theme switch (System reads your OS preference). Primary Color (Blue / Purple / Green) really recolors the app's accent everywhere. Font Size (Small/Medium/Large) is applied and persisted, though its visible effect is currently limited to a handful of text elements — most of the stylesheet uses fixed pixel sizes rather than scalable units, so a fuller effect would mean converting the CSS to rem-based sizing.
- 🌐 **Language** — English/Hindi/Gujarati selection is saved as a preference (`localStorage`) with a confirmation toast, but no translation dictionary is wired in yet — the interface text doesn't change languages on its own.

**New Settings panel — right column (Profile):**
- Profile photo upload, stored at `{user_id}/profile-avatar` in the same private bucket used for files — reuses the exact same per-user isolation you already have, no new bucket or policy needed.
- Full Name, Phone Number, and Username save to the user's Supabase `user_metadata` and update the header avatar/name on save. Email is shown but read-only (changing it needs a separate confirmation-email flow, out of scope here).
- A "Tenant Isolation" card showing the signed-in user's actual ID — the same value every storage path is scoped under.

**Small related fix:** the profile-avatar file is now excluded from the My Files listing (it previously would have shown up as a stray file at the root, the same class of bug as the original leak).

## 7. Language removed, Profile section polished (final pass)

- **Language card removed** — the English/Hindi/Gujarati selector and its `localStorage` preference are gone entirely, along with the wiring behind it.
- **Profile header redesigned:** the avatar is now a single hover target (68px circle, overlay reads "⇧ Change" on hover) instead of a separate "Change Photo" button, with a "Remove photo" link underneath it, next to the person's display name and email.
- **Fields regrouped:** Phone Number and Username now sit side by side in a two-column row (stacking on narrow screens); Email has a small hint explaining why it's locked.
- **Save button now gives real feedback:** it disables and reads "Saving…" during the request, then flashes "Saved ✓" for a moment before reverting — instead of just a toast with no button state change.
- **Tenant Isolation folded into a new "Account" card**, which now also shows *Member since* (from the account's actual creation date) and *Storage used* (the same total already computed for the dashboard stats, so it's never out of sync).

## 8. Workspace visibility bug fixed (state isolation)

The file-browser workspace and the Settings workspace were being toggled two different ways — one with an inline `style.display`, the other with the `hidden` attribute. The `hidden` attribute has the same CSS specificity as a class selector, and since `.settings-layout-split { display: grid; }` in the stylesheet loads after the browser's own default styles, it was winning the tie and silently overriding `hidden` — so the Settings/Profile panel stayed on screen underneath the file grid even when `hidden` was set.

Fixed by introducing one authoritative class, `.workspace-panel-hidden { display: none !important; }`, and switching both panels to use it consistently instead of a mix of `hidden` and inline styles. `!important` plus a single source of truth means there's no longer a specificity fight to lose.

## 9. Profile fields overflowing their container (fixed)

The actual bug: `.form-group`, `label`, and `input` styling in `style.css` were scoped entirely under `.auth-form` — meaning they only ever applied to the sign-in screen. Every field in the Settings → Profile panel (Full Name, Email, Phone, Username) shared the `.form-group` class but sat outside `.auth-form`, so they received **no styling at all** and fell back to the browser's raw default input rendering — no `width: 100%`, no dark theme, no box-sizing awareness — which is exactly why they were clipping past the card edge in the screenshot.

Fixed by generalizing the base field styling (`.form-group`, `.form-group label`, `.form-group input`) so it applies everywhere a `.form-group` is used, not just inside `.auth-form`. Scoped it to `.form-group label` specifically (rather than a bare `label` selector) to avoid leaking `text-transform: uppercase` onto unrelated labels like the Light/Dark/System radio options. Also added `min-width: 0` to `.form-group` so the two-column Phone/Username row can shrink properly instead of forcing the grid wider than its container.

## 10. Download opening in-browser instead of saving (fixed)

The `download` attribute on an `<a>` tag is silently ignored by browsers once the URL is cross-origin — and a Supabase signed URL always is, relative to the page. So clicking Download was just navigating to that URL like a normal link, and the browser did what it always does with a navigable image/PDF: display it inline instead of saving it.

Fixed by adding a `forceDownload()` helper that fetches the signed URL's bytes directly (`fetch()` → `blob()`), creates a local `blob:` URL from them (always same-origin, so `download` is respected), clicks a temporary link against that instead, and revokes the blob URL a few seconds later. The Download button now reliably saves to disk regardless of file type.

## Not changed (by design)

- Supabase project URL, anon key, and bucket name (`vault-files`) — kept identical so this is a drop-in replacement against your existing backend.
- Folder-as-prefix storage model, trash-via-move semantics, and the `.emptyFolderPlaceholder` marker convention.
- `localStorage` key `vault_favs` for favorites, so existing users' starred files carry over.

## 5. Per-user storage isolation (added after initial polish pass)

Previously every user shared one flat namespace in the `vault-files` bucket and files were served through permanent public URLs — meaning there was nothing stopping one signed-in user from listing or opening another user's files, or a public URL from working for anyone who obtained it.

- **App changes (`app.js`):** every storage call (`list`, `upload`, `move`, `remove`) is now routed through a single `absPath()` helper that prefixes the path with the signed-in user's ID (`currentUserId`), so each user's files live under their own top-level folder (`{user_id}/...`) instead of the shared root.
- **Signed URLs instead of public URLs:** `getPublicUrl()` (a permanent, unauthenticated link) has been replaced with `createSignedUrl()`, generated fresh each time someone clicks Preview or Download, expiring after 60 seconds.
- **Database changes (`storage-isolation-policies.sql`):** Row Level Security policies for `storage.objects` restricting select/insert/update/delete to objects whose first folder segment matches `auth.uid()`. Run this once in the Supabase SQL Editor.
- **Manual step required:** the `vault-files` bucket must be switched from **public** to **private** in the Supabase dashboard (Storage → vault-files → Edit bucket). This can't be done via SQL. Until this is off, the RLS policies don't actually protect anything, since a public bucket serves files straight from the CDN with no auth check.
- **Existing data:** if the bucket already has files from before this change, they're sitting at the bucket root rather than under a user-ID folder and will need to be moved into the matching user's folder once (see the SQL file's comments for the exact steps).
