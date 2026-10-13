# Connecting this build to the live AxForge endpoint (2026-08-26)

The public test endpoint is the OpenRouter provider host — TLS, bearer-gated,
routed over WireGuard to the DGX Spark in Sweden. `/v1/audio/music` was routed
there today with a 20-minute proxy timeout; verified end to end (15 s folk
track generated in ~64 s).

## In the app's API settings modal
- **Base URL:** `https://openrouter.axforge.ai/v1`
- **API key:** the `orx_…` bearer from the Caddyfile on the demo VM
  (`/opt/axforge/docker/Caddyfile.prod`, openrouter block — ask jose/Claude;
  deliberately not written into this repo so it never ships in a build).

Or for dev builds, set the base URL via env so the modal pre-fills:

```
EXPO_PUBLIC_AXFORGE_API_BASE_URL=https://openrouter.axforge.ai/v1
```

Never put the API key in env/files — it belongs in the modal (secure store).

## What the endpoint expects / returns (matches `src/services/musicApi.ts`)
- `POST {base}/audio/music` · `Authorization: Bearer <key>` · JSON body
  `{ "prompt": "...", "duration_s": 5–300, "seed"?: n, "lyrics"?: "[verse]…" }`
  — omit `lyrics` for instrumental (the server defaults it). The `model` and
  `x-axforge-region` fields the app sends are accepted and ignored.
- Response: `{ "created": …, "data": [ { "b64_json": "<wav>", "format": "wav" } ] }`
  — 32 kHz 16-bit stereo WAV.
- **Timing:** generation takes ~1–3 minutes wall-clock (measured: 64 s for a
  15 s track, ~160 s for 30–45 s tracks). Keep the request open (no client
  timeout) and show progress; the proxy allows up to 20 minutes.
- Errors: non-200 with `{"detail": "..."}` or an OpenAI-style `error.message`.
  A 503 usually means the model is reloading — retry after a minute.

## Also available on the same host + key (if the app grows)
- `POST /v1/chat/completions` — Qwen3.8 27B (streaming, tools; image input as
  OpenAI content parts)
- `POST /v1/images/generations` — ERNIE Image Turbo (`{prompt, size, n}`)
- `POST /v1/images/edits` — FLUX.2 Klein (`{prompt, image: <b64>}`) — routed today
- `POST /v1/audio/transcriptions` — Whisper (`{audioBase64, language?}`)
- `POST /v1/audio/speech` — Piper (`{input}` → `{audioBase64}`)
- `GET /v1/models` — the provider listing with prices

## Caveats for this phase
- This host doubles as the OpenRouter provider endpoint; when that application
  goes live the app gets its own token (one-line Caddy change, rotatable).
- Login comes later — Atom9 OIDC is the plan, same as the console.
- One music generation runs at a time on the node (requests queue behind the
  lock); fine for testing, worth a queue UI later.
