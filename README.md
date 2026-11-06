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

## Staff

`/dashboard/staff` is for the owner and for staff whose position grants the **Staff & payroll** module (the "Administration" position). Everyone else does not see it in the menu, is redirected away if they open the address, and the API refuses them with 403 as well. A company owner viewing a branch can look but not change anything.

| | Owner | Administration position |
| --- | --- | --- |
| Add, edit, reset password, deactivate staff accounts | yes | yes, staff accounts only |
| Create admin / accountant accounts | yes | no |
| Create, edit, delete positions | yes | no (can read them) |
| Assign a position | any | only positions that grant no more than their own |
| Manage their own account | no (the owner is not listed) | no |

- **Team:** accounts are never deleted, only deactivated and reactivated. Staff need a position. Search and filter by role and status.
- **Passwords:** leave the password empty and the server generates a temporary one. It is shown once in a dialog (with a Copy button) and cleared from the page when the dialog closes. The person must choose their own password at first sign-in. Resetting a password signs that person out everywhere.
- **Positions:** View/Create/Edit/Delete rights per module. A position that still has active staff cannot be deactivated or deleted.
- The sign-in response and `/auth/me/` carry `can_manage_team` and the position's `permissions`, which is what the menu and page use.

## Inventory

The Inventory page uses `/api/v1/inventory/`. The product catalog belongs to Head Office (or an independent business); branches see it read-only and keep their own stock. Stock is never edited directly: every change is a movement, and the server works out the balance and the status (in stock, low at or below the product's reorder level, out).

- Stock list: products with good and damaged stock, prices, search, category and status filters.
- Movements: paginated, filter by type, date and search.
- Adjust: increase, decrease or opening stock, for good or damaged stock.
- Add, edit and deactivate products: Head Office and independent businesses only. A company owner viewing a branch is read-only.

Stock transfers between branches are not on this page yet.

## Not connected to the API yet

The Settings profile/preferences still use demo data stored in the browser.
