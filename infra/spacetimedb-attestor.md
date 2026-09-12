# Least-privilege SpacetimeDB attestor

## Why

`/api/bind` verifies a wallet signature and then writes a wallet↔identity
binding into the module. That write needs an authenticated SpacetimeDB
identity — so the app server has to hold *some* token.

The obvious choice is wrong. `spacetime login show --token` returns your
**owner** token: the same credential `spacetime publish` uses. If a server
holding it were compromised, an attacker could **republish or delete the
whole database**, not merely forge a binding.

So the module distinguishes two identities:

| | Owner | Attestor |
|---|---|---|
| Where the token lives | your trusted machine only | the public app server |
| Can publish / delete the database | **yes** | no |
| Can attest wallet bindings | yes | yes |
| Can submit gameplay data as another wallet | yes | **no** |

Worst case if the app server is fully compromised: forged wallet bindings,
which costs you leaderboard integrity. Not the database, not funds.

## Setup (once)

**1. Mint an attestor identity.** This returns a fresh identity and its
token — it belongs to no account and owns nothing:

```bash
curl -X POST https://maincloud.spacetimedb.com/v1/identity
```

Response: `{"identity":"c200…","token":"eyJ…"}`

**2. Authorise it** from a trusted machine, logged in as the owner:

```bash
spacetime call shootris-game set_attestor '"<identity-from-step-1>"'
```

**3. Give the app server the token** (not the identity) in `.env.local`:

```
SPACETIMEDB_ATTESTOR_TOKEN=eyJ…
```

Never commit it; `.env.local` is gitignored.

## Rotating

Re-run all three steps. `set_attestor` overwrites the previous value, so the
old token loses its attestation rights the moment the new one is set. Do
this whenever a server is rebuilt, decommissioned, or suspected compromised.

## Also worth doing

Lock the database so even the owner token cannot delete it by accident:

```bash
spacetime lock shootris-game
```

Unlock deliberately with `spacetime unlock shootris-game` if you ever need
to remove it.

## Verifying

The binding flow should keep working end to end after the switch — connect a
wallet, sign the verification message, and confirm a row appears:

```bash
spacetime sql shootris-game "SELECT * FROM wallet_bindings"
```

If `/api/bind` returns 502, check the server logs: a `401 Invalid token`
from SpacetimeDB means the attestor was never authorised via `set_attestor`.
