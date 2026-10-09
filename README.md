# CareBridge

Personalized recovery starts before surgery.

Expo / React Native app (web + iOS + Android) for outpatient surgery prep and the first 72 hours after discharge. Three roles: patient, caregiver, care coordinator.

No AI. Discharge instructions are typed in by a person and stay draft until a coordinator approves them. Authorization is enforced in the data layer (local access checks or Supabase RLS), not in the UI.

Brand: `skills.md` and `design-system/`. Warm blue, Fraunces italic + IBM Plex Mono, grain, stamps, threads.

## Run locally (demo)

You do not need Supabase, a backend, or native folders. Default mode stores fictional demo data on the device.

```bash
npm install
npx expo start --web
```

Then open the URL Expo prints (usually `http://localhost:8081`).

Other entry points:

```bash
npx expo start            # QR for Expo Go / simulator
npx expo start --ios
npx expo start --android
```

If `npx expo install` fails with an npm cache permission error:

```bash
export npm_config_cache=/tmp/npm-cache-cb
```

### Demo logins

Tap a chip on Sign in, or use email + password `demo`:

- `maria@demo.carebridge` — patient
- `sofia@demo.carebridge` — caregiver
- `jordan@demo.carebridge` — coordinator
- `james@demo.carebridge` — second patient

Scripted walkthrough: [DEMO.md](DEMO.md).

Settings → **Reset demo data** restores the seed (and signs you out).

## Scripts

```bash
npm run web          # expo start --web
npm test             # vitest (acceptance tests)
npx tsc --noEmit     # typecheck
npx expo lint
```

## Env

Copy `.env.example` to `.env` only if you switch off local demo.

| Variable | Where | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_DATA_MODE=supabase` | app | Use Supabase instead of on-device store |
| `EXPO_PUBLIC_SUPABASE_URL` | app | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | app | Anon/public key only |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Never ship this in the app |

## Optional: Supabase + API

Schema: `supabase/migrations/0001_schema.sql`. Create a project, run the migration, then set the public env vars and restart Expo.

API (Zod + JWT, reuses the same engines):

```bash
npx tsx watch server/index.ts
```

If `server/index.ts` is not in this checkout yet, the app still runs fully in local demo mode.

## Layout

```
src/app/          Expo Router screens
src/core/         types, engines, schemas (no React)
src/data/         LocalRepository + SupabaseRepository
src/ui/           design-system components
src/i18n/         EN / ES
```
