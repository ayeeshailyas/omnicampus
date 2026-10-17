# OmniCampus

Admin-mediated university brand-ambassador platform with AI matching.
**React (Vite)** frontend · **Node.js** backend (no npm dependencies) · **SQLite** database · light neumorphism UI.

## Run (production-style, one server)
Requires Node.js 22.13+.

    npm run build     # installs the client deps and builds the React app into client/dist
    npm start         # http://localhost:3000   (API + built frontend)
    npm test          # 38 backend checks: RBAC, isolation, fee gate, workflow

## Develop the frontend with hot reload
    npm start                 # terminal 1: API on :3000
    npm run dev:client        # terminal 2: Vite on http://localhost:5173 (proxies /api to :3000)

On first start the database is created in `./data` and seeded with an admin and demo data.

| Role    | Email                  | Password |
|---------|------------------------|----------|
| Admin   | admin@omnicampus.com   | admin123 |
| Company | shop@glowlab.com       | demo     |
| Student | ayesha@uaf.edu.pk      | demo     |

## Registration fee
Students pay **500**, companies pay **1500** (currency `PKR` by default).

Flow: register → pay → admin confirms payment → admin verifies documents → dashboard unlocks.

- Amounts are fixed on the server; the client cannot change them.
- Users pay by JazzCash / Easypaisa / bank transfer and submit the transaction reference
  (plus an optional receipt screenshot). Each reference can be used only once.
- The admin confirms or rejects each payment in the **Payments** tab; an account **cannot be verified** until its fee is confirmed.
- `PAYMENT_MODE=demo` adds an instant "Demo payment" method for testing (never use in production).
- To use an online gateway later (Stripe, JazzCash API, Safepay…), call it from `POST /api/pay`
  and mark the payment `Confirmed` from the gateway's webhook instead of the admin button.

## Configuration (environment variables)
`ADMIN_EMAIL`, `ADMIN_PASSWORD` (set before first run) · `SEED_DEMO=0` (no demo data) ·
`FEE_STUDENT`, `FEE_COMPANY`, `CURRENCY` · `PAY_INSTRUCTIONS` (text shown on the payment screen) ·
`PAYMENT_MODE` · `SECRET` · `PORT` · `DATA_DIR`. Serve behind HTTPS in production.

## How the SRD rules are enforced (server-side)
- **RBAC**: every route declares its allowed roles; tokens are HMAC-signed and expire after 7 days.
- **Isolation**: `GET /api/state` returns a different payload per role. Students never receive company or user records; companies never receive student records or ids before assignment.
- **Contact privacy**: student and brand contact details are only sent after the admin approves the match.
- **Verification gate**: unpaid, unverified or rejected accounts cannot use any role endpoint.
- **Uploads**: ID photos, payment receipts and task proofs (JPG/PNG/WEBP/PDF, 5 MB) are stored outside the web root and downloadable only by the admin and the owner.
- Passwords use scrypt; login/registration/payment attempts are rate limited.

## Project layout
    server.js            API, auth, RBAC, payments, AI matching, SQLite
    test.js              backend integration tests
    client/src/          React app (App.jsx, views/Auth|Admin|Company|Student.jsx, ui.jsx, api.js)
