# Ginga Tea Requester

A responsive, interactive front-end prototype for the Ginga Tea Requester.

## Included
- One-button standard tea request flow
- UK-time opening hours (07:00–22:00)
- 60-minute cooldown and four-request daily limit
- Remaining-request and cooldown display
- Pending / fulfilled request lifecycle
- Admin interface for rules, request history and statistics
- Local browser notification permission/test
- Dark sci-fi control-room visual design
- Large red TEA emergency button with rotating warning lights on acceptance
- CONTRACT IN EFFECT activation state

## Important limitation
This is a **front-end prototype**, not a production multi-device app. Requests and settings are stored in this browser's localStorage. Admin access is not authenticated. Browser notifications are local only; remote push notifications are not connected.

The next implementation stage needs a persistent database and server-side API so request acceptance, cooldowns, daily limits, admin authentication, and device subscriptions are enforced centrally.

## Run locally
Serve this folder with any static HTTP server, for example:

```bash
npx serve .
```

Open the local URL printed by the server.

## Defaults
- Opening: 07:00 UK local time
- Closing: 22:00 UK local time
- Cooldown: 60 minutes
- Daily accepted-request limit: 4
- Drink: standard tea
- Accepted requests cannot be cancelled