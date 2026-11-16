# Render deployment

The Dockerfile runs the Bun application, including its HTML, fonts, native SVG renderer, and ffmpeg. It does not deploy Convex or build the older Vite frontend.

The Blueprint uses a paid Starter web service and a 1 GB persistent disk. The disk retains local state and image files, limits Render to one instance, and disables overlapping zero-downtime deployments. Brief downtime during deploys is intentional: two running servers can overwrite the same Convex store. Automatic deploys are disabled until changes are deliberately released.

Set `KEIKI_API_KEY` privately on Render to enable server-initiated private money notices. The existing preview host does not have this key; without it, private notices remain unavailable. The hosted agent's tool URL can still be updated through its existing Keiki integration.

## Cutover

1. Supply the prompted environment variables privately. Copy `NICKEL_MONEY_SECRET` from the existing Convex deployment and use the live Keiki agent's `NICKEL_TURN_SECRET`; do not generate replacements independently. Set `NICKEL_BASE_URL` to the assigned HTTPS Render URL. Leave `NICKEL_SYNC_SECRET` unset unless both the server and Convex are deliberately configured with the same value. Whop credentials stay in Convex, with sandbox mode unchanged.
2. Stop the existing preview server and ensure no process will restart it before starting the Convex-connected Render service. The Blueprint's first deploy starts the application, so do not apply it with live backend credentials before this stop is confirmed.
3. Deploy the desired Git commit using this Dockerfile. Check that startup reports `Nickel state: convex`, `/h` returns HTML, and `/og/h.png` returns a PNG. Check photo imports, authenticated profile access, and the wallet using a real sandbox test identity.
4. Update the hosted Keiki tool's server URL to the Render URL without changing its matching turn secret. Exercise a trusted messaging turn and confirm that generated links use Render.
5. Verify a $1 Whop sandbox top-up is credited exactly once after reload. Sandbox cash-out remains blocked until the Nickel business is verified. Restart the Render service and confirm the same profile and wallet still load.

If rollback is necessary, stop Render before restarting the preview server. Never run both against this Convex deployment. Rotate any secrets previously pasted in chat only through a coordinated update of every consumer.

## Isolated container smoke test

Build with `docker build -t nickel .` and run with `docker run --rm -p 10000:10000 nickel`. Without `CONVEX_URL` or provider keys, this uses isolated local state and cannot overwrite the live Convex store. This checks the image, not the live integrations.
