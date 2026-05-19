# Vinyl Database

A first version of a local vinyl collection app.

## What it does

- Upload album cover images into a review queue.
- Upload barcode photos in batch mode to create identified draft records quickly.
- Edit artist, title, year, multiple genre tags, label, length, cost, where you got it, country, format, notes, and artwork fields.
- Flag records that need better artwork.
- Add additional artist tags so collaboration albums can be found under each artist in search, filters, and CSV export.
- Keep a separate wishlist tab with expected cost, notes, and streaming search links.
- Enter artist and/or album title fields for MusicBrainz lookup.
- Optionally scan a vinyl barcode photo to help identify the album.
- Search MusicBrainz for possible matching releases and select the right album, with a UPC fallback when MusicBrainz does not have the barcode indexed.
- Show richer match cards with artwork, score, source, year, country, format, and label details.
- Cross-reference draft records against MusicBrainz and Cover Art Archive, including release-group artwork fallback.
- Pick official cover artwork when multiple images are available.
- Preview the imported MusicBrainz tracklist before saving.
- Save reviewed records into a shelf-style collection with top toolbar filters, summary tiles, cover-only/details views, adjustable columns, CSV export, and Spotify/Apple Music links.
- Download a full JSON backup and restore it later, including artwork, tracklists, notes, tags, links, costs, and source details.
- Use the app on desktop or mobile-width screens with responsive upload, review, and collection layouts.
- Persist the collection in the browser with IndexedDB, or sync it to Supabase when cloud environment variables are configured.

## Current limits

- Without Supabase environment variables, the app is still browser-only. IndexedDB can hold much more than `localStorage`, but each browser has its own separate copy.
- MusicBrainz is called directly from the browser for now. A backend proxy would let the app use a custom User-Agent and cache lookups more politely.
- The UPC fallback currently uses a local Vite proxy during development. A production version should move that lookup into the backend too.
- The current Supabase setup is a shared-library prototype. For private multi-user access, add Supabase Auth and owner-based row policies.

## Optional Supabase cloud sync

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local`.
4. Fill in:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_SUPABASE_LIBRARY_ID=main
```

5. Restart the dev server.

When those values are present, the app shows `Cloud sync` in the header and reads/writes the shared `vinyl_libraries` row. If the cloud library is empty, your local IndexedDB records are uploaded the first time the app opens.

## Deploy with Vercel + Supabase

1. Push this folder to a GitHub repository.
2. In Vercel, import that repository as a new project.
3. Add the same environment variables from `.env.example` in Vercel Project Settings.
4. Deploy. Vercel will run `npm run build` and publish the app with a public URL.

`vercel.json` is included so the single-page app refreshes correctly and the UPC fallback route works after deployment.

## Backups

Use `Backup` to download `vinyl-database-backup-YYYY-MM-DD.json`. This is the safest copy of the library because it preserves the full app data, not just spreadsheet columns. Use `Restore` to import that file into the app again.

CSV export is still available for spreadsheet viewing, but JSON backup is the better emergency copy.

## Run it

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. On this machine the vinyl app is running at `http://127.0.0.1:5174/`.
