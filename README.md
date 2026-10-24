# AssetTrack

Company equipment register, staff loans, and decentralized annual inventory checks. Built with Next.js, Supabase Auth/Postgres, QR labels and optional Web NFC. The interface follows the supplied inventory dashboard reference.

## What works

- Search and filter laptops, projectors/cameras, printers, radios and storage devices.
- Staff sign-in, self-service book-out with a due date, and book-in with condition reporting.
- A dedicated `/admin` sign-in route. Admins add equipment, mark missing/maintenance items, and retire replaced equipment without deleting history.
- Annual stocktake campaigns: custodians account for their own items; admins can account for any item.
- Downloadable QR labels, camera QR scanning, manual tag entry, and reading NFC URL/text records on compatible Android Chrome devices. Write the asset URL to physical NFC tags with a phone NFC writer; iPhones can open URL tags through the operating system.
- Audit trail, department/category reports and CSV export. Connected records refresh every 15 seconds.
- Explicitly labelled browser-only demo if Supabase environment variables are absent. Demo roles and data are for evaluation only; do not enter confidential company information into demo mode.

## Local development

Use Node 24 (tested), or Node 22. Run in this existing checkout; cloud tasks are already isolated and do not need an additional worktree.

```sh
npm ci --cache /tmp/assettrack-npm
npm run dev
```

Without database configuration this opens the demo. To connect real storage, create `.env.local` using `.env.example` and set the two public Supabase variables below. Restart/rebuild after changes. Never commit environment files.

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
```

The Supabase publishable key is public by design. Every table has row-level security. All application mutations go through database functions that validate the authenticated user and role. Browser clients cannot promote staff to administrators or write audit records directly. Staff can read the shared equipment register; loan history is restricted to the borrower and administrators.

## Create the database and root account

1. Create a project at https://supabase.com/dashboard. Choose your region and retain its database password securely.
2. In the project's SQL Editor, run **supabase/schema.sql once** on the new database, before creating application users. It creates the schema, account-profile trigger, permissions and transactional functions.
3. Copy the project URL and public publishable key from project settings into `.env.local`.
4. Bootstrap the root account locally using the script below. Read the Supabase **service role** key from the project's API settings into a private environment variable. This key is only for this local administrative step; never put it in `NEXT_PUBLIC_*`, browser code, chat, Git, or the Vercel frontend settings.

```sh
# Run in this repository, in Bash. Prompts do not echo secret values.
read -rp 'Supabase project URL: ' SUPABASE_URL
read -rsp 'Supabase service role key: ' SUPABASE_SERVICE_ROLE_KEY; printf '\n'
read -rsp 'Initial root password (12+ characters): ' ROOT_ADMIN_PASSWORD; printf '\n'
export SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ROOT_ADMIN_PASSWORD
export ROOT_ADMIN_EMAIL='Huatchaisg@gmail.com'
node scripts/bootstrap-admin.mjs
unset SUPABASE_SERVICE_ROLE_KEY ROOT_ADMIN_PASSWORD
```

The script creates the root user and assigns its admin role. Passwords are handled by Supabase Auth; no default password is embedded in the application. If an account with that email already exists, the script stops rather than changing its password or privileges. For an existing verified account, the project owner can assign `role='admin', approved=true` in the Supabase `profiles` table using the dashboard. Do not expose service-role credentials to the application to support routine logins.

The root login address is `/admin`. Staff use `/`. Use **Forgot password?** and the email recovery link to set a new password. Set up Supabase's email provider and Auth redirect allowlist before relying on confirmation/recovery emails. New public signups receive only the staff role and remain blocked from company data until approved in the admin Staff access tab. Administrators can assign departments or suspend staff access there. For an internal-only rollout, disable public signup in Supabase Authentication settings and provision/invite staff using the dashboard.

## Deploy to Vercel

**Account ownership is required.** This checkout cannot create or access your Vercel/Supabase accounts without your authorization. Vercel Hobby is intended for personal, non-commercial use; check Vercel's current terms and use an eligible plan for a company rollout. Supabase Free has storage, usage and availability limits; check these before using it as a business inventory system.

1. Put this repository in your GitHub account. In Vercel, choose **Add New → Project**, import `Chaisg88/MCF-booking-`, and use the **Next.js** framework preset with the repository root directory.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel's environment variables for Production (and Preview if needed). Do not add the service-role key or root password. Deploy.
3. Vercel supplies the real HTTPS deployment URL when deployment finishes. In Supabase Authentication → URL Configuration, set that URL as the Site URL and allow `https://YOUR_ACTUAL_DOMAIN/reset-password` for recovery. Add localhost redirects only for local development if desired.
4. Visit the actual deployment URL plus `/admin` and sign in as `Huatchaisg@gmail.com` with the password supplied during bootstrap. The header must say **Connected workspace**, not **Demo workspace**.
5. Add one real equipment record, download/attach its QR label, create a staff account, book the equipment out, start a stocktake and verify it using the staff account on a second device. Book it in and check the admin audit log. Physical camera and NFC hardware must be tested on real devices over HTTPS.

CLI deployment is also supported after `vercel login` and secure project configuration: `vercel --prod`. Deployment does not provision the Supabase schema or root account automatically.

## Checks

```sh
npm run build
npm test
# With an existing Chromium installation:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npx playwright test
```

`npm test` runs the real SQL schema in embedded PostgreSQL (PGlite), with separate authenticated identities, exercising role restrictions, booking, double booking prevention, borrower-only access, stocktake authorization/idempotency, faulty returns, retirement and protected audit writes. It is not a substitute for validation against the connected Supabase project.

Playwright exercises the demo UI: adding, booking, returning faulty equipment, stocktake confirmation, staff controls, browser persistence, mobile layout, and manual scan fallback. It does not claim camera/NFC hardware or production authentication was tested. The config starts the built application if needed. If Chromium is elsewhere, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its real executable path; alternatively install Playwright Chromium and adapt the config.

## Operational notes

- Retiring equipment preserves loans and audit history. Retired assets are omitted from the active register and stocktake denominator.
- Stocktake progress uses the current active equipment register. Historical campaign checks are retained; a frozen historical asset roster is not implemented.
- A QR/NFC scan identifies equipment. Verification is an explicit custodian attestation of physical presence; it is not cryptographic proof of possession.
- Demo state uses browser local storage. Clear the `assettrack-demo-v1` entry to reset sample data. Real connected company records never use demo storage.
- Refresh polling reads only records permitted to the current authenticated user. Production backups, recovery policy and provider availability should match your company's needs.
