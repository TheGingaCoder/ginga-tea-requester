# Ginga Tea Requester

A shared multi-device tea request system powered by Supabase.

## Existing backend setup
1. Run `supabase/schema.sql` if the base tables do not already exist.
2. Run `supabase/multidevice-migration.sql`.
3. Create the administrator in Supabase Authentication and add their user ID to `public.tea_admins`.
4. Deploy the `tea-requester-build` branch with GitHub Pages.

## Web Push notification setup
1. Run `supabase/push-notifications-migration.sql` in the Supabase SQL Editor.
2. Generate one VAPID key pair from the repository root with `deno run -A scripts/generate-vapid-keys.ts` (Deno must be installed). Keep this key pair; do not regenerate it after devices have subscribed.
3. In the generated output, copy the complete `vapidKeys` object into the Supabase Edge Function secret named `VAPID_KEYS_JSON`. Set `VAPID_SUBJECT` to a contact URI such as `mailto:gingacoder@gmail.com`.
4. Copy `applicationServerKey` from the same output into the `VAPID_PUBLIC_KEY` constant near the top of `app.js`, then commit that change to `tea-requester-build`.
5. Deploy `supabase/functions/send-tea-notification/index.ts` as an Edge Function named `send-tea-notification`. The function must have JWT verification disabled because the requester page is public; `supabase/config.toml` contains this setting for CLI deployments.
6. In the admin panel, sign in on each device, open Devices, and select Register this device. Allow notification permission.

On iPhone/iPad, add the site to the Home Screen first, open it from that icon, then register the device. Browser push support depends on the operating system and browser.

## Shared behavior
- Requests, fulfilment status, daily allowance and settings are stored in Supabase.
- Request acceptance is checked by a database function, including opening hours, master enable switch, pending-request lock, cooldown and daily limit.
- Supabase Realtime refreshes connected browsers when requests or settings change.
- A successful new request invokes the Edge Function, which sends Web Push notifications to registered administrator devices.
- Admin changes and push subscription registration require a signed-in user present in `tea_admins`.
- Sound preference remains local to each browser.

## Security
- The browser contains only the Supabase publishable key and VAPID public key.
- Keep `VAPID_KEYS_JSON` and all service-role/secret keys in Supabase Edge Function secrets. Never put them in this repository or frontend JavaScript.
- The notification endpoint only claims a pending request once, preventing repeat sends for the same request.

## Limitations
- A device must support Web Push, have granted notification permission, and have an active internet connection.
- Notifications are delivered by the browser/platform push service; delivery timing is not guaranteed.
- If no administrator device is registered when a request is submitted, no push notification is sent for that request.