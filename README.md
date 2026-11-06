# VGSync Web (v2)

Astro frontend for the VGSync backend (`vgsync-backend-v2`).

## Run locally

```sh
cp .env.example .env      # PUBLIC_API_URL, default http://localhost:8000/api/v1
npm ci
npm run dev               # http://localhost:4321
```

The backend must allow this origin: `CORS_ALLOWED_ORIGINS=http://localhost:4321`, and `FRONTEND_URL=http://localhost:4321` so password-reset emails link here. With `EMAIL_HOST` empty the backend prints the email (and link) to its console.

## Authentication

| Page | What it does |
| --- | --- |
| `/` | Sign in with business code, username, password. "Remember me" keeps the session after the browser closes and pre-fills the business code and username. |
| `/forgot-password` | Asks the backend to email a reset link. |
| `/reset-password?uid=..&token=..` | Opens from the email link and sets a new password. |
| `/dashboard/change-password` | Forced on first login (`must_change_password`), also reachable from Settings. Signs the user out everywhere afterwards. |

How it works (`src/lib/`):

- `api.ts` sends the Bearer token, refreshes it once on a 401 (refresh tokens rotate, so one refresh is shared by parallel requests), and sends the user to sign-in if the refresh fails.
- `session-store.ts` keeps the session in `localStorage` when "Remember me" is ticked, otherwise in `sessionStorage`. Tokens are readable by scripts on this origin, so do not add third-party scripts.
- `auth.ts` has `login`, `logout` (revokes the refresh token on the server), `forgotPassword`, `resetPassword`, `changePassword`, `refreshProfile`, and branch switching (`loadBranches`, `switchBranch`).
- Signing out in one tab signs out the others.

## Suppliers

`/dashboard/suppliers` uses `/api/v1/suppliers/` for the active business. Fields follow the API (name, contact, phone, email, address, PAN, notes, active/inactive); the money figures (owed, advance, credit to receive) are calculated by the server. Suppliers cannot be deleted, only deactivated. A company owner viewing a branch is read-only, so the add/edit buttons are hidden.

## Customers

`/dashboard/customers` uses `/api/v1/customers/` for the active business. Name is the only required field; phone, email and PAN are optional (a phone number can only belong to one customer in a business). Customers have a type (individual, business, fleet) and a credit limit. The limit only warns: the list and detail show "over limit" when the customer owes more than it, and sales are never blocked.

- The money figures come from the server: owes you, you owe them (after returns), advance received, total sales, replacement goods due.
- Filters: search (name, phone, PAN), type, active/inactive, has dues.
- Statement: every sale, payment, return, refund, replacement and credit adjustment with a running balance, filtered by date and type, with Excel and PDF download.
- Customers are deactivated, not deleted. A company owner viewing a branch is read-only.

## Not connected to the API yet

The Staff page (`src/lib/staff-demo.ts`), inventory and the Settings profile/preferences still use demo data stored in the browser.
