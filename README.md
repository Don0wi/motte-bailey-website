# Motte & Bailey Restaurant — multi-page website

A responsive multi-page restaurant marketing website using the supplied restaurant photographs, with an Express API, SQLite persistence, staff login, a protected admin dashboard, enquiry forms, and server-side validation.

## Pages

- `/` Home
- `/about` Our Story
- `/menu` Menu (shows published items; starts empty until staff add confirmed dishes)
- `/reservations` Reservation enquiry
- `/gallery` Gallery with accessible lightbox
- `/events` Private dining and event enquiry
- `/contact` Contact form and map
- `/privacy` Privacy notice draft
- `/terms` Terms draft
- `/admin/login` Staff login
- `/admin` Protected dashboard

Navigation uses separate routes rather than scrolling to homepage anchors. The Express server serves nested routes and provides the API.

## Requirements and local setup

Use Node.js 20 or newer.

1. Open this directory in VS Code.
2. Copy `.env.example` to `.env`.
3. Set `SESSION_SECRET` to a long random secret and set a unique `ADMIN_EMAIL` and `ADMIN_PASSWORD` (minimum 12 characters) for the initial admin bootstrap.
4. Install dependencies and start the server:

```bash
npm install
npm run dev
```

5. Visit `http://localhost:3000`. Sign in at `/admin/login` using the bootstrap credentials.
6. After the first administrator has been created, remove `ADMIN_PASSWORD` from the environment and restart. Use your normal secret-management process for credentials.

The first start creates `data/motte-bailey.sqlite` and the required tables. Keep `data/` private and persistent in deployment; it is ignored by Git.

## API endpoints

Public:
- `GET /api/health`
- `GET /api/menu` — published menu only
- `POST /api/reservations`
- `POST /api/events`
- `POST /api/contact`
- `POST /api/admin/login`

Authenticated staff:
- `GET /api/admin/me`
- `POST /api/admin/logout`
- `GET /api/admin/reservations`
- `PATCH /api/admin/reservations/:id`
- `GET /api/admin/events`
- `GET /api/admin/messages`
- `GET /api/admin/menu`
- `POST /api/admin/menu`
- `PATCH /api/admin/menu/:id`
- `DELETE /api/admin/menu/:id`

## Important production configuration

### Reservations

Online booking is deliberately **disabled by default**. Until the restaurant confirms opening hours, seating duration, table capacity, time slots, booking rules, and the desired conflict-handling policy, the reservation endpoint responds with a clear message directing guests to call. The current schema stores enquiries when booking is enabled, but a full live-capacity engine and atomic slot locking still need to be implemented after the restaurant supplies its real table/slot rules. Do not enable `BOOKING_ENABLED` just to make the form accept requests.

### Email

Configure `RESTAURANT_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMTP_SECURE` to enable staff notification emails. If SMTP is not configured, enquiries are still stored in SQLite, but notifications are not sent. The API does not claim that email has been delivered.

### Staff accounts

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` on the first run. Passwords are hashed with bcrypt. There is no public registration endpoint. Protect `/admin` and its APIs with the same secure deployment and HTTPS requirements as any application handling personal data.

### Database and deployment

SQLite is suitable for a small single-instance deployment with a persistent writable disk. Do not deploy this database on ephemeral storage or run multiple instances against separate local SQLite files. For multi-instance hosting or higher booking concurrency, migrate to PostgreSQL and add transactional capacity locking. Back up the database securely and define retention/deletion procedures for personal data.

### Legal and restaurant content

The privacy and terms pages are drafts requiring business/legal review. The menu intentionally does not invent dishes, prices, allergens, or dietary claims. Verify the opening hours, menu, booking policy, business email, and image publication rights before launch.

## Checks

```bash
npm run check
```

This runs JavaScript syntax checks. Integration tests and browser-level Playwright tests still need to be added and run in an environment with dependencies installed. Do not describe the website as fully production-verified until those tests, security review, real email delivery, and booking-rule validation are complete.
