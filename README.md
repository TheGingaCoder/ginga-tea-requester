# GingaHelp

GingaHelp is a standalone household assistance app. It uses the existing Supabase project, but all new tables and the notification function are GingaHelp-specific. The legacy Tea Requester tables and notification function are retained and are not used by the GingaHelp frontend.

## App routes

- `/` — the household request app.
- `/control/` — authenticated administrator panel for changing the operating status and registering notification devices.

## Operating modes

- `active` — all eight request buttons are available.
- `sleep` — requests are disabled.
- `college` — requests are disabled.
- `away` — requests are disabled, except Notify.

The automatic timetable uses UK local time (including GMT/BST changes): Sleep every day from 00:00–07:00, and College Monday–Friday from 07:30–18:00. Outside those windows the status is Active. A weekly College exclusion skips the College window for that Monday–Sunday week.

The Control Panel has an **Exclude this college week** button. It adds the current Monday–Sunday week to the exclusion list; the button changes to restore the normal schedule if the week is already excluded. The scheduler checks every minute, so status changes are applied automatically even when the app is closed.

Choosing Sleep, College, or Away manually sets a manual override. Selecting Active clears the override and resumes the automatic timetable. Notify is available during College and Away, but not Sleep; all other requests remain disabled.

Status is stored in `public.gingahelp_status` and sent to connected clients through Supabase Realtime. The main app also checks status on load; the Edge Function independently checks it before sending any request notification.

## GingaHelp database

The base schema is in `supabase/gingahelp-migration.sql`, followed by the access-hardening migration in `supabase/gingahelp-security-hardening.sql`, then the automatic timetable migration in `supabase/gingahelp-schedule-migration.sql`. These create:

- `gingahelp_status` — the single global operating mode.
- `gingahelp_admins` — GingaHelp administrator allow-list.
- `gingahelp_devices` — Web Push subscriptions for administrator devices.
- `gingahelp_rate_limits` — short request throttle fingerprints.
- `gingahelp_college_excluded_weeks` — Monday dates for excluded College weeks.
- `gingahelp-auto-status` — the once-per-minute Supabase Cron job that updates the operating mode.

The base migration copies the existing administrator user IDs from `tea_admins` into `gingahelp_admins`. The hardening migration puts the admin-check helper in a non-exposed schema and restricts device subscriptions to those administrators. Neither migration modifies Tea request history, tea settings, or tea device subscriptions.

## Notifications

The separate Edge Function source is `supabase/functions/gingahelp-send-notification/index.ts`. It validates request types, checks that the current mode permits the request (Notify is also allowed in College and Away), applies a short server-side request throttle, and sends Web Push to registered GingaHelp devices. It does not create request or fulfilment records.

The deployment reuses the VAPID key pair already configured for this Supabase project. Keep `VAPID_KEYS_JSON` in Supabase Edge Function secrets. The matching public key is in `control/control.js`; it is public and may be committed. Never commit private VAPID keys or the service-role key.

## Administrator setup

The current GingaHelp administrator is copied from the existing `tea_admins` record. Sign in at `/control/` with that Supabase Auth account. Status updates and device registration are restricted to this allow-list.

To receive push notifications, sign in on each device, select **Register this device**, and allow notifications. Then use **Send test notification** to verify delivery. For iPhone/iPad, install the app to the Home Screen and open it from there before registering push.

## Deployment

The `tea-requester-build` branch is published through the existing GitHub Pages workflow. Keep all GingaHelp changes on that branch; do not merge them into `main` unless explicitly requested.

## Limitations

Web Push requires a supported browser, notification permission, a registered device, and internet connectivity. Delivery timing depends on browser and platform push services. A successful Edge Function response confirms that the push service accepted delivery, not that the operating system displayed it.
