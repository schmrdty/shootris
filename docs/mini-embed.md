# Shootris as an embedded mini-game

Route: **`/mini`** → `https://shootris.schmidtiest.xyz/mini`

A self-contained build for hosts like D3MYUR: one mode, short sessions, no
account, no wallet, no network calls. The host owns identity, persistence and
anything tournament-shaped; the game only reports what happened.

```html
<iframe
  src="https://shootris.schmidtiest.xyz/mini"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  style="width:100%;height:100%;border:0"
  title="Shootris"
></iframe>
```

## Messages out (to the host)

Sent with `window.parent.postMessage(msg, '*')`, fire-and-forget — the game
never waits for a listener, and never includes any user or device identifier.

| Message | When |
| --- | --- |
| `{ type: 'shootris:start' }` | a run begins |
| `{ type: 'shootris:score', score: <int>, durationMs: <int> }` | game over, once per run |

## Messages in (from the host)

The host hides its tab with `display:none`, which fires neither
`visibilitychange` nor `blur` inside the iframe, so pausing must be told.

| Message | Effect |
| --- | --- |
| `{ type: 'host:pause' }` | pause immediately |
| `{ type: 'host:resume' }` | show the pause screen — the player chooses when to play |

The game also pauses on its own on `visibilitychange` and `blur`.

## What it does and doesn't do

- **Controls:** touch deck (joystick: move, push up for forward, flick down
  to rotate; buttons: hold, rotate, crosshair shoot) plus pause, restart and
  mute in the top bar — every target at least 44px. Keyboard on desktop:
  ←/→ or A/D move, ↑/W forward, ↓/S rotate, Space shoot, C or Shift hold,
  P or Esc pause. Mouse works on every button.
- **No modals:** the sandbox omits `allow-modals`, so start, pause and game
  over are in-page panels. No `alert`/`confirm`/`prompt`.
- **No network:** no SpacetimeDB, no wallet, no analytics, no fetches.
- **Storage:** an anonymous local best score in `localStorage`, wrapped in
  try/catch. The game runs correctly when storage is partitioned or blocked.
- **Audio:** muted by default; short tones only after the player unmutes.
- **Gestures:** touch handling is confined to the control deck, so swipes
  over the rest of the page still reach the host app.
- **Viewport:** fits 300–400px wide with no horizontal scroll.

## Framing policy

`/mini` sends `Content-Security-Policy: frame-ancestors` allowing
`d3myur.schmidtiest.xyz` (and other `*.schmidtiest.xyz` hosts) and no
`X-Frame-Options`. Every other route sends `X-Frame-Options: SAMEORIGIN`.

To allow another host, set `MINI_FRAME_ANCESTORS` in the server's
`.env.local` to a full CSP source list, then rebuild:

```
MINI_FRAME_ANCESTORS='self' https://d3myur.schmidtiest.xyz https://example.com
```

## Known wrinkle

`/mini` skips the wallet and onchain providers, but it still downloads the
app's shared client bundle, and the Farcaster mini-app SDK inside it posts
two `eip6963RequestProvider` handshake messages to the parent frame on load.
They carry no identity and can be ignored. Removing them entirely means
giving `/mini` its own root layout (a route-group split of `src/app`).
