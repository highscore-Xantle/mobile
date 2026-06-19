# Xantle — setup & deploy

Expo (SDK 56) + Supabase. One codebase → iOS, Android, Web.

## 1. Install & run locally
```bash
cd xantle/mobile
npm install
# extra runtime deps (Expo picks compatible versions):
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
cp .env.example .env          # then fill in Supabase URL + anon key
npx expo start                # press w (web) · or scan QR with Expo Go on your phone
```

## 2. Supabase
1. Create a project at supabase.com → Settings → API → copy **URL** + **anon key** into `.env`.
2. Open the SQL editor → paste & run `supabase/migrations/0001_init.sql` (profiles, rooms, room_players, subscriptions, RPCs, RLS, realtime).
3. Enable auth providers: Email, Google, Apple (Authentication → Providers).

## 3. Deploy — EAS (needs your accounts)
```bash
npm i -g eas-cli
eas login                     # your Expo account (free)
eas build:configure           # links the project
```
**Android (test build / Play):**
```bash
eas build -p android --profile preview      # internal APK to share
eas build -p android --profile production   # for Play Store
```
**iOS → TestFlight** (needs an **Apple Developer account, $99/yr** — EAS builds in the cloud, no Mac):
```bash
eas build -p ios --profile production        # EAS creates the certs/profiles for you
eas submit -p ios                            # uploads to App Store Connect → TestFlight
```
**Web:**
```bash
npx expo export -p web        # static site in dist/ → deploy to Netlify/Vercel
```
**OTA updates** (push JS fixes without a new store build):
```bash
eas update --branch production -m "fix: ..."
```

## Structure
- `src/app/` — routes (expo-router). `index.tsx` landing · `login.tsx` (stub) · _layout root stack.
- `src/lib/supabase.ts` — Supabase client.
- `supabase/migrations/` — schema. App config in `app.json`; build profiles in `eas.json`.
