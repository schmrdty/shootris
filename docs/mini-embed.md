# Embedded build (`/mini`)

`/mini` is a self-contained build of Shootris for embedding in another web
application: a single game mode, short sessions, no account and no wallet.
It makes no network requests and stores nothing that identifies a player.
The embedding application owns identity, persistence and any scoring or
competition features built on top of the results it receives.

## Route

```
https://<host>/mini          e.g. https://shootris.schmidtiest.xyz/mini
```

## Embedding

```html
<iframe
  src="https://shootris.schmidtiest.xyz/mini"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  style="width:100%;height:100%;border:0"
  title="Shootris"
></iframe>
```

`allow-modals` is not required: the build never calls `alert`, `confirm` or
`prompt`. Start, pause and game-over states are rendered in the page.

## Message API

### Sent by the game

Delivered with `window.parent.postMessage(message, '*')`. Delivery is
fire-and-forget: the game never waits for a listener and never includes a
user, wallet or device identifier.

| Message | Sent when |
| --- | --- |
| `{ type: 'shootris:start' }` | a run begins |
| `{ type: 'shootris:score', score: <int>, durationMs: <int> }` | game over, once per run |

### Accepted by the game

An embedding page that hides its container with `display:none` triggers
neither `visibilitychange` nor `blur` inside the frame, so pausing in that
case must be signalled explicitly.

| Message | Effect |
| --- | --- |
| `{ type: 'host:pause' }` | pause immediately |
| `{ type: 'host:resume' }` | display the pause screen; play resumes only on player input |

The game also pauses on its own `visibilitychange` and `blur` events.

## Behaviour

| Area | Detail |
| --- | --- |
| Controls (touch) | Joystick: move left/right, push up to advance one space, flick down to rotate. Buttons: hold/swap, rotate, shoot. Pause, restart and mute in the top bar. All targets at least 44px. |
| Controls (keyboard) | `←`/`→` or `A`/`D` move, `↑`/`W` advance, `↓`/`S` rotate, `Space` shoot, `C` or `Shift` hold, `P` or `Esc` pause. |
| Controls (mouse) | Every on-screen control is clickable. |
| Viewport | Designed for 300–400px wide containers; no horizontal scroll. |
| Network | None. No database, wallet, analytics or asset fetches beyond the page itself. |
| Storage | An anonymous best score in `localStorage`, written inside `try`/`catch`. The game runs normally when storage is blocked or partitioned. |
| Audio | Muted until the player unmutes. Short synthesised tones only. |
| Gestures | Touch handling is confined to the control deck, so gestures elsewhere reach the embedding page. |

## Configuration

Framing is controlled by response headers. `/mini` sends a
`Content-Security-Policy: frame-ancestors` list and no `X-Frame-Options`;
all other routes send `X-Frame-Options: SAMEORIGIN`.

The permitted origins default to the project's own domains. To allow
others, set `MINI_FRAME_ANCESTORS` to a CSP source list before building:

```
MINI_FRAME_ANCESTORS='self' https://example.com https://app.example.com
```

## Implementation notes

- `/mini` does not mount the wallet or onchain providers used elsewhere in
  the application, but it is served from the same client bundle. One
  dependency in that bundle (the Farcaster mini-app SDK) posts two
  `eip6963RequestProvider` handshake messages to the parent frame on load.
  They contain no identifying data and can be ignored. Eliminating them
  would require giving `/mini` its own root layout.
- Source: `src/app/mini/page.tsx`; shared controls in
  `src/components/MobileControls.tsx`.
