# End-to-end tests

Playwright tests that sign in and use the real pages in a browser (desktop and phone size).

## Run

1. Start the backend on `http://localhost:8000` with a **scratch database holding demo data** (never real data), and allow the test site's address:

   ```
   DB_NAME=vg_dev CORS_ALLOWED_ORIGINS=http://localhost:4400 python manage.py runserver 8000
   ```

2. From this folder: `npm run test:e2e`

   The run builds the site, serves it with `astro preview` on port 4400, runs the tests and stops it.
   `E2E_SKIP_SERVER=1` uses a server you already started; `E2E_PORT` changes the port.

Sign-in uses `E2E_BRANCH`, `E2E_USER`, `E2E_PASS` (default: the demo owner of the scratch database).

## What is covered

| File | Checks |
| --- | --- |
| `login.spec.ts` | wrong password, right password, page without sign-in goes to login |
| `smoke.spec.ts` | every page opens, no JS errors, no `undefined`/`NaN` on screen, old `/dashboard/...` addresses |
| `navigation.spec.ts` | sidebar links (Returns, Follow-ups, Purchase Return, Staffs, Position) open the right page and section, one active link, quick successive clicks cause no errors, back/forward |
| `cache.spec.ts` | revisiting a list does not ask the server again, a page opened before still opens offline with the offline bar |
| `phone.spec.ts` | no sideways scrolling on any page at phone width |

Not covered: creating or editing records (the tests only read), and the pages for staff who are not owners.
