# Xantle — Build Plan (14-day MVP)
Product: Xantle — a party/group games app for real-life gatherings (picnics, family, friends, dates). "Jackbox/Kahoot for in-person hangouts." Every screen feels like a game.
Platforms: Web + Android + iOS, one codebase.
Stack: Expo (React Native) + Supabase (Postgres/Auth/Realtime/RLS/Edge Functions) + EAS (build/submit/OTA). Animation: Reanimated, Gesture Handler, Skia, Lottie, Expo Audio.
Money: ads (placement decided as we go) + premium $4.99/mo (unlocks group play).
Duration: 14 working days.

## Team & working rules
Person | Role | Owns
---|---|---
Victor Otung | Senior Dev | Landing page, Authentication, Droughts game, Rush pixel, Architecture, Supabase schema, EAS
Promise Friday | Mid Dev | Main page design (header, Live players, games available), Numbers rush game
Samuel Toluwani | Junior Dev | Settings (email, push, logout, policy, about, terms, password, close account), Push notifications (Android/iOS), Profile page (picture, username, country flag, game stats, active status)
Olivia Amehs | Ops Manager | Live audit — receives SOD/EOD + progress, tracks delivery, store assets, QA routing

Rules: branch → PR → Victor reviews → merge. SOD/EOD live audit to Olivia daily.
Test every element top-to-bottom before marking a task done (see §QA). Nothing is "done" until tested on a real device.

## The experience (what we're building, in order)
1. Crazy load-in — animated splash with high-end graphics (the first impression).
2. Login — email · Google · Apple.
3. Onboarding — capture username only. Nothing else.
4. Home shell — a love-meet-style graphic that enters as a roll-over reveal, left→right. Top bar = profile + menu.
5. Games — anyone opens a game and plays; works like love-meet's realtime games. New game added every 2 weeks (so the engine must be plug-in).
6. Premium UI — a showcase screen so users see exactly what subscribing unlocks (group play + more later).
7. Game-feel everywhere — animations, transitions, haptics, sound on every interaction.

## Particles (granular tasks) by workstream

### A. Foundation — Victor
- A1. Expo app init: TypeScript, Expo Router, folder structure, lint/format, repo + branch flow.
- A2. EAS config: dev/preview/prod profiles, cloud build for iOS+Android, OTA update channel.
- A3. Supabase project: env wiring, supabase/ migrations folder, types generation.
- A4. Schema v1 + RLS: profiles, rooms (code, host_id, status, game_kind, is_group), room_players, subscriptions. SECURITY DEFINER RPCs: create_room, join_room (guest-capable), start_room, leave_room.
- A5. Realtime engine: room presence + broadcast wrapper (the reusable multiplayer backbone, love-meet pattern ported).
- A6. Game-plugin framework: a Game interface (config, state schema, render, server hooks) so a new game = one folder, no engine edits. This is what makes "new game every 2 weeks" real.

### B. Design system & game-feel — Victor (set up) + All (apply)
- B1. Theme tokens (colors, type, spacing), fonts, sound kit, haptics helper.
- B2. Reusable animated primitives: buttons, cards, transitions, the roll-over reveal component.
- B3. Skia/Lottie setup for graphics-heavy screens (splash, win screens).

### C. Entry flow
- C1. Splash / load-in animation (high-end graphics, Lottie/Skia) — *Sam*.
- C2. Login screen — email + Google + Apple via Supabase Auth + Expo — *Promise*.
- C3. Onboarding — username capture (uniqueness check) + write profile — *Sam*.

### D. Home shell & navigation
- D1. Home with roll-over reveal (left→right) + top bar (profile + menu) — *Promise*.
- D2. Game grid/launcher (open any game) — *Promise*.
- D3. Profile screen + menu drawer + settings — *Sam*.

### E. Games (lock the first 3 — see Open Items)
- E1. Room/lobby UI — create, join via code/QR, players list, start, invite — *Promise*.
- E2. Game #1 (flagship) — full build on the engine — *Victor*.
- E3. Game #2 — *Promise*.
- E4. Game #3 (simplest) — *Sam*.

### F. Monetization
- F1. Ads — react-native-google-mobile-ads (AdMob); rewarded + interstitial; placement TBD — *Promise*.
- F2. Premium / IAP — RevenueCat; $4.99/mo; group-play gate (free = solo/1v1, premium = 3+) — *Victor*.
- F3. Premium showcase UI — the "here's what you unlock" screen — *Sam*.

### G. QA & deploy
- G1. Top-to-bottom test pass — every screen/flow/game on real Android + iOS + Web — *All*.
- G2. EAS production builds + Web deploy — *Victor*.
- G3. Store setup + submit (App Store, Play) + assets — *Victor* + *Olivia*.

## 14-day timeline (3 tracks)
Day | Victor (Senior) | Promise (Mid) | Sam (Junior)
---|---|---|---
1 | A1–A3 init, EAS, Supabase | C2 auth providers | C1 splash animation
2 | A4 schema + RLS + RPCs | C2 auth finish | C1 splash finish
3 | A5 realtime engine | D1 roll-over home shell | C3 onboarding (username)
4 | A6 game-plugin framework | D1 home + D2 launcher | D3 profile screen
5 | B1–B3 design system + game-feel primitives | E1 room/lobby UI | D3 menu + settings
6 | E2 Game #1 (flagship) | E1 lobby finish | E4 Game #3 start
7 | E2 Game #1 | E3 Game #2 | E4 Game #3
8 | F2 premium/IAP (RevenueCat) | E3 Game #2 | F3 premium showcase UI
9 | F2 gate (free vs group) | F1 ads integration | F3 premium UI finish
10 | game-feel pass (review) | F1 ads finish | polish profile/onboarding
11 | engine/edge-case hardening | game-feel pass on games | game-feel pass on entry flow
12 | QA lead + fixes | QA Android | QA iOS + Web
13 | review all fixes | fix list | fix list
14 | EAS builds + store submit | smoke test builds | store assets w/ Olivia

## QA protocol — "test every element, top to bottom"
For each screen/flow, before it's marked done:
- Loads with no error on Android + iOS + Web.
- Every button/animation/sound fires; back/exit works.
- Multiplayer: 2+ devices in a room, join/leave/start/win all correct; presence updates live.
- Auth: email, Google, Apple all sign in; onboarding username persists.
- Premium gate: free user blocked from group play; premium user unlocked.
- No crash on bad input / lost connection.
Olivia tracks the QA checklist; a task is "done" only when its row is green on all three platforms.

## Olivia — live audit
- Collect SOD/EOD from all three daily; maintain the task board (this doc's particles as tickets).
- Track the day-by-day table; flag slippage to the CEO early.
- Own store assets (icon, screenshots, descriptions, privacy text) for Day 14.
- Run the QA checklist; nothing ships un-green.

## Open items to lock before Day 6 (games)
1. The first 3 games. "Works like love-meet" + "new game every 2 weeks." Decide: port love-meet games (Draughts/Number Duel/Pixel Rush) or new party games (trivia / draw-guess / word). The engine (A6) is game-agnostic so this doesn't block Days 1–5, but must be locked by Day 6.
2. Same-room vs remote join model (QR for in-person vs link for remote) — affects E1 lobby UX.
3. Ad placement — decided as we go (F1), but pick the first slot (rewarded before game?) by Day 9.
