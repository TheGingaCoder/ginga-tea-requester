# Ginga Tea Requester

A shared multi-device tea request system powered by Supabase.

## Setup (required once)
1. Open the Supabase SQL Editor for the project and run `supabase/multidevice-migration.sql`.
2. In Supabase Authentication, create an email/password user for the administrator.
3. Add that user to `public.tea_admins` using the SQL statement at the bottom of the migration (replace the example email).
4. Deploy the `tea-requester-build` branch with GitHub Pages.

## Shared behavior
- Requests, fulfilment status, daily allowance and settings are stored in Supabase.
- Request acceptance is checked by a database function, including opening hours, master enable switch, pending-request lock, cooldown and daily limit.
- Supabase Realtime refreshes all connected browsers when requests or settings change.
- Admin changes require a signed-in user present in `tea_admins`.
- Sound preference remains local to each browser.

## Security
The browser contains only the Supabase publishable key. Never put a service-role or secret key in this repository. Row Level Security and database functions enforce administrator actions and request rules.
