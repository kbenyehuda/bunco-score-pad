# Bunco Score Pad

A single-page scorekeeper for in-person Bunco parties — several tables of
players rotating every round. Plain HTML/CSS/JS, no build step, no backend,
no accounts. Runs entirely in the browser, so it can be hosted for free on
GitHub Pages, Netlify, Cloudflare Pages, or just opened as a local file.

## Running it

There is nothing to install or build. Either:

- Double-click `index.html` to open it directly in a browser, or
- Serve the folder with any static file server (useful for testing the
  Stripe redirect flow, which needs a real URL), e.g.:
  ```
  npx serve .
  ```

To deploy, push this repo and point GitHub Pages / Netlify / Cloudflare
Pages at the repo root — no build command needed.

## How it works

- **Setup**: choose number of tables, players per table (default 4), and
  number of rounds (default 6 — standard Bunco). Then name each player.
- **Per round**: each table gets a card with a tally control per player —
  a stepper for how many dice matched the round's target number, and a
  Wipeout toggle for three 1s. Scores and special outcomes (Bunco,
  Wipeout) are calculated automatically.
- **Leaderboard**: cumulative scores update live and can be toggled open
  during play.
- **Persistence**: the entire game state is saved to `localStorage` after
  every change, so a mid-party page refresh (or a phone getting passed
  around) doesn't lose the game. Resuming picks up right where you left
  off.
- **End of night**: final standings, the winner, most Buncos, and most
  Wipeouts.

All scoring rules live in one `RULES` object at the top of `app.js` so
they're easy to tweak (point values, what counts as a Bunco/Wipeout,
default table/round counts) without hunting through the rest of the code.

## Monetization (honor system)

There's a small dismissible banner offering an optional $1.99 unlock that
enables a printable end-of-night summary. It's intentionally low-friction
and honor-system — there is no server-side license check for a $1.99
impulse buy:

- Clicking "Unlock" opens a **Stripe Payment Link** in a new tab.
- Returning to the app with `?unlocked=1` (or any Stripe Payment Link
  redirect containing `session_id`) in the URL sets a `localStorage` flag
  that hides the banner and enables the "Print Summary" button.
- Alternatively, entering the fallback unlock code in the app does the
  same thing, for anyone who pays but doesn't get redirected back.

### Before launch, you need to:

1. **Set the real Stripe Payment Link.** Edit `MONETIZATION.STRIPE_PAYMENT_LINK`
   in `app.js` (currently a placeholder: `https://buy.stripe.com/REPLACE_WITH_YOUR_PAYMENT_LINK`).
2. Optionally configure the Payment Link's confirmation page / redirect to
   point back at your deployed app with `?unlocked=1` appended, so buyers
   are unlocked automatically on return instead of needing the code.
3. Optionally change the fallback code in `MONETIZATION.UNLOCK_CODE`
   (currently `BUNCOVIP`) to whatever you want to hand out manually (e.g.
   to comps, testers, or anyone who pays you outside of Stripe).

## Cross-promotion footer

The footer link ("more little tools like this →") points to a placeholder
URL (`CROSS_PROMO_URL` in `app.js`). Update it once you have a hub page for
your other tools.
