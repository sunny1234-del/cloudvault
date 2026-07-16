-- ============================================================================
-- CloudVault — per-user storage isolation
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================================
-- This assumes files are stored as {auth.uid()}/{path...}, which is what the
-- updated app.js now does automatically for every upload/list/move/delete.
--
-- storage.foldername(name) splits an object's path into an array of folder
-- segments (excluding the filename itself). foldername(name)[1] is therefore
-- the very first folder — the user's own ID, if the app is behaving.
-- These policies make that the *enforced* rule, not just a convention.
-- ============================================================================

-- 1. Users can list/read only objects inside their own folder
create policy "vault: read own files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'vault-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 2. Users can upload only into their own folder
create policy "vault: upload to own folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'vault-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Users can rename/move only their own files (used by trash + restore)
create policy "vault: update own files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'vault-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'vault-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Users can permanently delete only their own files
create policy "vault: delete own files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'vault-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- Required manual step (cannot be done via SQL):
-- Dashboard → Storage → vault-files → ⋯ menu → "Edit bucket" → turn OFF "Public bucket"
--
-- Why this matters: a public bucket serves files straight from the CDN with
-- no auth check at all, so the policies above would be dead code as long as
-- the bucket stays public. The app has already been updated to use
-- createSignedUrl() (short-lived, per-request links) instead of the
-- permanent getPublicUrl() links it used before — but that only protects
-- anything once the bucket itself is private.
-- ============================================================================

-- ============================================================================
-- Migrating existing files (only needed if you already have files in the
-- bucket from before this change, stored at the root instead of under a
-- user-ID folder). Run once per existing user, replacing the UUID:
--
--   Dashboard → Storage → vault-files → select existing files → Move →
--   move them into a new folder named after that user's ID
--   (Authentication → Users, copy the UUID from the "User UID" column).
-- ============================================================================
