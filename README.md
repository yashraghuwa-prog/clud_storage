# Vaultspace — Secure Cloud File Storage and Sharing

A React + TypeScript + Vite prototype backed by Supabase Auth, PostgreSQL, Row Level Security (RLS), and a private Storage bucket. Designed for a college Cloud Computing demonstration.

## Included features

- Email/password sign-up and sign-in through Supabase Auth
- Private cloud uploads (10 MB per file; allowlisted extensions and bucket MIME restrictions)
- File listing, search, download, and delete
- Owner-only file metadata policies and UUID-folder Storage policies
- Share files with a specific email address for 10 minutes, 1 hour, 24 hours, or 7 days
- Shared-with-me view, expiry checks, and owner revocation
- Responsive dashboard UI with stats, empty states, notifications, and security messaging

## 1. Requirements

- Node.js 20+ recommended
- A Supabase account: https://supabase.com/dashboard
- Terminal and VS Code

## 2. Install and run

In Terminal, enter the project directory (the directory containing this `package.json`):

```bash
npm install
cp .env.example .env.local
```

Open `.env.local` and replace the placeholders with your Supabase **Project URL** and **publishable key** (or legacy `anon` key):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Find these in Supabase Dashboard → Project Settings → API (the exact menu label may change). Never use the `service_role` or secret key in a browser app.

Start the app:

```bash
npm run dev
```

Open the local URL Vite prints, usually http://localhost:5173.

## 3. Configure Supabase database and Storage

1. Open your Supabase project.
2. Open **SQL Editor** → **New query**.
3. Copy all of `supabase/schema.sql` into the editor and run it.
4. Confirm the `secure-files` bucket exists and is marked **private**.
5. In Authentication → Providers, make sure Email is enabled.
6. For a quick local demo, you may turn off email confirmation under Authentication settings. For a real deployment, keep confirmation enabled and configure email delivery.
7. Restart Vite after changing `.env.local` (stop with Ctrl+C, then `npm run dev`).

The SQL is intended to be re-runnable for this prototype. It creates the `files` and `file_shares` tables, RLS policies, private bucket, and Storage policies.

## 4. Demonstration flow

1. Sign up with a first test email, for example `owner.demo@example.com`.
2. Sign in and upload a PDF or image smaller than 10 MB.
3. Show that the file appears in My Files, then download it.
4. In a second browser/incognito session, create a second account such as `recipient.demo@example.com`.
5. Sign in as the owner again and share the file with the recipient email for 10 minutes.
6. Sign in as the recipient and open **Shared with me**. Open/download the shared file.
7. As the owner, revoke the share; refresh the recipient session and confirm it no longer appears and Storage access is denied for newly requested URLs.
8. Show the private bucket and the RLS policies in the Supabase dashboard.

## 5. Important behavior and security notes

- Sharing is account-based: the recipient must sign in with the email address entered by the owner. This prototype does not send an email invitation.
- The app creates short-lived signed URLs after Supabase Storage authorizes the signed-in user. Existing signed URLs can remain valid until their expiry, even if the database share is revoked; revocation blocks future URL generation/requests after policy evaluation, but cannot reliably invalidate an already-issued signed URL immediately. Use short expiries for demonstrations.
- The `view` permission opens the file inline where the browser supports it; it is not DRM and cannot prevent a recipient from saving content they can view. Use `download` for an explicit download action.
- The frontend validates extensions and sizes for usability. The private bucket's size/MIME settings and RLS policies are the backend controls. MIME types can be spoofed; this prototype does not scan for malware.
- Supabase publishable/anon keys are intended for browser use when RLS is configured correctly. Never expose service-role/secret keys.
- This is a student prototype, not a production document-management system. Production hardening would include audit logs, rate limits, stronger content inspection, secure email invitations, tests, and monitoring.

## Troubleshooting

**“Invalid API key” / network error** — Check the URL and publishable/anon key in `.env.local`, then restart Vite.

**Signup succeeds but you cannot enter the app** — Email confirmation may be enabled. Confirm the email or disable confirmation only for a local demo.

**Upload returns “row-level security”** — Run the full `supabase/schema.sql`; ensure Storage bucket `secure-files` exists and remains private.

**Recipient sees no shared file** — Make sure they signed in using exactly the recipient email (case-insensitive), the share has not expired/revoked, and the `file_shares` RLS policies were created.

**SQL policy creation errors on a previously edited project** — Check existing custom policies with the same names and resolve conflicting schema changes before rerunning.

## Project structure

```text
secure-cloud-storage/
├── src/
│   ├── App.tsx          # Auth, dashboard, file actions, sharing
│   ├── lib.ts           # Supabase client and file helpers
│   ├── main.tsx         # React entry point
│   └── styles.css       # Responsive dashboard and auth styles
├── supabase/
│   └── schema.sql       # Tables, RLS, private bucket, Storage policies
├── .env.example
├── index.html
├── package.json
└── README.md
```
