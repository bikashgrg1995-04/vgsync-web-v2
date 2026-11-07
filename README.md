# VGSync Web (v2)

Astro frontend for the VGSync backend (`vgsync-backend-v2`).

## Run locally

```sh
cp .env.example .env      # PUBLIC_API_URL, default http://127.0.0.1:8000/api/v1
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

## Purchases

The Purchase page uses `/api/v1/purchases/`. Totals are always worked out by the server (discount first, VAT on the discounted amount, freight untaxed); the form only shows a preview.

- Purchases: list with search and filters (status, payment, supplier, dates), a detail panel with lines, totals, payments and deliveries.
- Draft: create, edit, cancel (with a reason). A draft has no effect on stock.
- Receive goods: all at once or in parts. This is what adds stock (visible on the Inventory page).
- Payments: record (also before the goods arrive) and void.
- Returns: from a received or part-received purchase, from good or damaged stock; void.
- Supplier credit: use credit from returns as a refund, replacement goods (mark as arrived later) or set against a purchase; void.
- A company owner viewing a branch is read-only.

Not on this page yet: Excel/PDF export of purchases (the API has none).

## Sales

The Sales page uses `/api/v1/sales/`. The server works out every total (discount first, VAT on the discounted amount) and the finance charge of an EMI; the form only previews them.

- Sales: stock, bike (full payment or EMI) and maintenance (parts, local items, service charge). Draft, edit, confirm (gives the invoice number and takes stock), cancel a draft with a reason.
- Payments: record (also on a draft, as an advance) and void. A walk-in sale must be paid in full; an EMI sale needs its down payment before confirming.
- Returns: from a confirmed sale; walk-in returns are refunded straight away. Void a return.
- Customer credit: refund, replacement goods (mark handed over later) or set against a sale; void.
- Follow-ups: post-service check, 90-day maintenance, EMI instalments and credit to receive. Maintenance follow-ups are marked done or skipped; EMI and credit ones close when paid.
- Bikes: register a bike by chassis number (stock first), and local items (things sold that are not in the shared catalog).
- A company owner viewing a branch is read-only.

Not on this page yet: printable invoice and Excel/PDF export of sales.

## Orders

The Orders page uses `/api/v1/inventory/transfers/`: a Branch orders stock from Head Office, and the same page shows what each side can do.

- Branch: place an order, cancel it before anything is sent, receive goods (good and damaged apart, in parts if needed), and send damaged stock back with a reason.
- Head Office: see orders from its branches, dispatch (all or in parts, never more than ordered), reject an order before dispatch, receive returned goods, then review them (accepted or rejected, with remarks).
- An order moves no stock until goods are dispatched and received. The history of dispatches, receipts and returns is listed under the order.
- Independent businesses have no orders. A company owner viewing a branch is read-only.

## Reports

The Reports page uses `/api/v1/reports/` (owner only). Pick a report, set the period, and download the same view as Excel or PDF.

- Profit & loss (cash basis, by category and month), Receivables and Payables (aged 0-30, 31-60, 61-90, over 90 days), Stock value.
- Sales trend (by month, week or day, less returns), Top products (by value or quantity), Top customers, Top suppliers, Payroll.
- A non-owner who opens the page sees "Reports are only available to the business owner".

## Payments

The Payments page uses `/api/v1/finance/` and `/api/v1/payroll/` (owner only), in three tabs.

- Expenses and Income: totals, refunds, net and a by-category split, with filters. Add, edit and void manual lines (expense categories rent, utilities, transport, marketing, maintenance, other; income category other). Lines marked "auto" come from staff, supplier or customer payments and are locked: void the payment instead.
- Staff pay: set pay (monthly salary with allowances and salary day, or daily wage), record payments (full, part or advance), add wage, bonus or deduction, and see what is owed, the advance and a statement. Void a payment or entry with a reason.
- A company owner viewing a branch is read-only. A non-owner sees "only available to the business owner".

## Overview (dashboard home)

The Overview page is built from the existing APIs, so it shows only what the signed-in person may see.

- Everyone with access: today's and this month's sales, pending follow-ups (overdue highlighted), low or out of stock, open stock orders, a 14-day sales chart, and short lists of follow-ups, stock to watch and recent sales.
- Owner only: this month's money in, money out, cash profit, what customers owe and what is owed to suppliers.
- It reloads when the branch is switched.

## Styling note

Pages build tables and dialogs from script, so their `<style>` blocks are `is:global` (Astro's scoped styles would not reach that markup). Keep class names prefixed per page (`cus-`, `sa-`, `pu-`, `rp-`, `py-`).

## Branches

The Branches page (company owner only) lists Head Office and every branch from `/api/v1/businesses/`, with search and an active/inactive filter, and an "Open" button to work inside a branch. It is read-only: only a super admin, in Django Admin, adds a branch, edits a business or switches one off (for example when a subscription is unpaid). A switched-off business cannot sign in. Independent businesses do not see this page.

## Settings

Settings has four tabs, all on the real API.

- Profile: change your first name, last name, email and phone (`PATCH /auth/me/`). Username, role and home branch are read-only. The photo is kept on this device only.
- Business (owner only): shows the business and company details, read-only. VGSync support changes them.
- Security: session start, password status and a link to change password.
- Appearance: light or dark theme on this device.

The old demo tabs (organization, inventory defaults, regional, notifications) were removed because nothing used them. They can come back when the backend has settings to store.
