# CRC Worship v3

Flow: **Login → Date selector (calendar) → Dashboard for that date → Church screen**

- `public/` – static front end (login, calendar, dashboard, church screen, Bible JSON)
- `api/` – Vercel serverless functions (login, sessions, library proxy, media)
- Songs & images library = your existing Google Sheets (read-only, unchanged).
- Each date's session (chosen songs/images/verses + screen settings) = MongoDB `sessions` collection.
- Background uploads = MongoDB `media` collection.

## Run locally
1. Open `.env` and replace `<CLUSTER_HOST>` with your Atlas host (Atlas → Connect → Drivers).
   In Atlas > Network Access, allow your IP (and 0.0.0.0/0 for Vercel).
2. `npm install` then `npx vercel dev` → http://localhost:3000
3. Sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`.
4. `npm test` runs the API + parsing tests.

## Deploy to Vercel
Import the GitHub repo in Vercel, then add every variable from `.env.example` under
Project → Settings → Environment Variables. **Never commit `.env`.** After deploying, rotate the DB password.

## Rules built in
- Tamil / Thanglish (any non-English language) is always 50% of the English size (`css/app.css` `.ln.ta,.ln.th`).
- Long verses/lyrics auto-shrink together to fit the screen.
- Lyric language detection: Tamil-script lines = Tamil; Latin lines = Thanglish if the slide has Tamil, else English.
  Override per line with prefixes `[ta]`, `[th]`, `[en]`.
