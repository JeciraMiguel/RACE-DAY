# RaceDayApi

Race-event management platform: organizers publish events and categories, participants register, and organizers record finish times that produce a ranked leaderboard.

## Projects

| Project | Description |
| --- | --- |
| `RaceDayApi.Contracts` | DTOs and enums shared by the API and the tests |
| `RaceDayApi.Server` | ASP.NET Core Web API (EF Core + SQLite, JWT auth, Swagger, Azure Blob Storage for event banners) |
| `RaceDayApi.AppHost` | .NET Aspire orchestrator: runs Azurite, the API and the React frontend together |
| `frontend` | React 19 + Vite + TypeScript single-page app |
| `RaceDayApi.Tests` | xUnit unit and integration tests |

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| [.NET SDK](https://dotnet.microsoft.com/download/dotnet/10.0) | 10 | API, AppHost, tests (`dotnet --version` must print `10.x`) |
| [Node.js](https://nodejs.org/) | `^20.19.0` or `>=22.12.0` | frontend |
| [Docker](https://docs.docker.com/get-docker/) | any recent | Azurite (banners) under the AppHost, and the Docker option below. Not needed for the "API + frontend by hand" option |

## Quick start

Pick one of three ways to run the project. All of them are run from the repository root.

### Option A: Docker (fastest, nothing else to install)

```bash
cp .env.example .env        # then edit .env: set JWT_KEY (32+ characters) and ADMIN_PASSWORD
docker compose up --build
```

Open **http://localhost:8080**. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from your `.env`. See [Docker](#docker) for details.

### Option B: Aspire (full development stack)

```bash
cd frontend && npm install && cd ..
chmod +x frontend/node_modules/.bin/*        # Linux/macOS only, see Troubleshooting
dotnet dev-certs https --trust               # optional: trust the HTTPS dev certificate
dotnet run --project RaceDayApi.AppHost
```

The Aspire dashboard URL is printed in the terminal (typically `https://localhost:17007`). It starts Azurite (blob storage, needs Docker), the API and the frontend; open each one from the dashboard:

| Resource | Where |
| --- | --- |
| React frontend | the `webfrontend` row of the dashboard |
| API (Swagger) | `https://localhost:7375/swagger` |

In Development, demo accounts for every role are created automatically: see [Test users](#test-users-development-seed).

### Option C: API and frontend by hand (no Docker, no Aspire)

Two terminals. Event banner uploads need a blob storage (see [Event banner uploads](#event-banner-uploads)); everything else works without one.

```bash
# Terminal 1: the API on http://localhost:5398 (Development environment, demo users seeded)
dotnet run --project RaceDayApi.Server --launch-profile http

# Terminal 2: the frontend on http://localhost:5173, proxying /api to the API
cd frontend
npm install
SERVER_HTTP=http://localhost:5398 npm run dev          # PowerShell: $env:SERVER_HTTP="http://localhost:5398"; npm run dev
```

The database (`RaceDayApi.Server/raceday.db`) is created and migrated automatically on first start, and a venue ("Cape Town Stadium") is seeded. Delete the file to start from scratch.

## Test users (development seed)

In the `Development` environment the API seeds one account per kind of user at startup, so every role and edge case can be tried by hand. The accounts are created only when they do not exist yet (restarting never changes a password) and the seed is defined in `RaceDayApi.Server/Data/DatabaseSeeder.cs`.

| Email | Password | Role | Profile | Use it to try |
| --- | --- | --- | --- | --- |
| `admin@raceday.local` | `Admin#12345` | Admin | none | Everything: `/manage` with platform stats, venues, **Users** (change roles, deactivate), delete events |
| `organizer@raceday.local` | `Organizer#12345` | Organizer | none | Create venues and events, add categories, publish, manage registrations and payments, record results. Only sees and edits their own events |
| `participant@raceday.local` | `Participant#12345` | Participant | woman, born 1990-05-17 | Register, cancel, My races / My results / Profile; eligible for women's and age categories |
| `runner@raceday.local` | `Runner#12345` | Participant | man, born 1985-03-02 | The same as above, and a refusal for women-only categories |
| `newcomer@raceday.local` | `Newcomer#12345` | Participant | empty | A refusal ("complete your profile") for age and gender categories until the profile is filled in |
| `inactive@raceday.local` | `Inactive#12345` | Participant | empty | Signing in is refused (deactivated account); reactivate it from **Manage -> Users** |

How to use them:

- **Browser:** sign in at `/login`. To compare two roles side by side use two browser profiles or a private window (the session lives in the tab).
- **API:** `POST /api/auth/login` with the email and password, then send the returned `token` as `Authorization: Bearer <token>`. In Swagger click **Authorize** and paste it (the `.http` file works too).
- **A quick tour:** sign in as the organizer, create an event with a women-only category and publish it; then try to register as `participant`, `runner` and `newcomer` to see the three eligibility outcomes; sign in as the admin to see everyone in **Manage -> Users**.

Configuration (in `appsettings.Development.json`):

```json
"Seed": {
  "AdminEmail": "admin@raceday.local",
  "AdminPassword": "Admin#12345",
  "DemoUsers": true
}
```

- `Seed:AdminEmail` / `Seed:AdminPassword` create the first administrator, in any environment.
- `Seed:DemoUsers` creates the five accounts above. It is `false` by default, so **production, Docker and the automated tests do not get them** (the dedicated seed tests turn it on). Enabling it outside Development logs a warning, because the passwords are public.
- An existing development database picks up the missing accounts on the next start; to start from scratch delete `RaceDayApi.Server/raceday.db` (it is recreated and migrated automatically).
- The end-to-end tests start the API in Development, so these accounts exist there too, but the tests create their own unique users and never depend on them.

These credentials are for local development only.

## Configuration

| Key | Purpose |
| --- | --- |
| `Jwt:Key` | Token signing key, **at least 32 characters, no fallback**. The app refuses to start without it |
| `Jwt:Issuer` / `Jwt:Audience` | Token validation (defaults in `appsettings.json`) |
| `ConnectionStrings:DefaultConnection` | SQLite file (default `Data Source=raceday.db`) |
| `Jwt:AccessTokenMinutes` / `Jwt:RefreshTokenDays` | Token lifetimes (defaults 15 and 14) |
| `Auth:MaxFailedAttempts` / `Auth:LockoutMinutes` | Login lockout (defaults 5 and 15) |
| `RateLimit:AuthPerMinute` | Requests per minute per IP on the credential endpoints (default 30) |
| `Seed:AdminEmail` / `Seed:AdminPassword` | Optional admin account created at startup |
| `Seed:DemoUsers` | `true` creates one test account per user type (see **Test users**); development only, default `false` |
| `AzureBlobStorage:ConnectionString` | Blob storage for event banners (default: Aspire's `blobs` connection, else the local emulator) |
| `AzureBlobStorage:PublicBaseUrl` | Optional. The address browsers use to fetch banners when it differs from the storage address (a Docker hostname, or a CDN) |
| `Health:Enabled` | `true` exposes `/health` outside Development (the Docker image sets it) |
| `DisableHttpsRedirection` | `true` when TLS ends at a proxy or the container speaks plain HTTP |
| `Jwt:RefreshReuseLeewaySeconds` | Grace period (default 30) in which a just-rotated refresh token may be replayed, e.g. a page reloaded mid-refresh |

Outside development, provide these through user-secrets or environment variables (`Jwt__Key`, `Seed__AdminPassword`, ...), for example:

```bash
dotnet user-secrets set "Jwt:Key" "<long-random-secret>" --project RaceDayApi.Server
```

### Event banner uploads

Banners are stored in Azure Blob Storage (container `event-banners`, public read). Under the AppHost an Azurite container is started and wired automatically. To run the API alone, start Azurite yourself:

```bash
docker run -p 10000:10000 mcr.microsoft.com/azure-storage/azurite azurite-blob --blobHost 0.0.0.0
```

Events without an image work without any storage. Accepted images: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, up to 5 MB. Replacing a banner or deleting the event removes the old blob.

## Docker

One image holds the React build (served from `wwwroot` by the API, with a fallback to `index.html` for client routes) and the API. The compose file adds Azurite.

```bash
cp .env.example .env        # set JWT_KEY (32+ characters) and ADMIN_PASSWORD
docker compose up --build   # http://localhost:8080
```

- SQLite lives on the `raceday-data` volume and banners on `azurite-data`.
- The first administrator is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Inside compose the API reaches Azurite as `azurite:10000`, while banners are served to browsers through `http://localhost:10000` (`AzureBlobStorage__PublicBaseUrl`).
- Swagger is only enabled in Development; `/health` is on in the image.
- For real deployments replace Azurite with an Azure Storage account (`AzureBlobStorage__ConnectionString`, and `PublicBaseUrl` for a CDN), keep secrets out of the image, and put TLS in front.

## Authentication

- Access tokens are JWTs that live 15 minutes (`Jwt:AccessTokenMinutes`). Refresh tokens live 14 days (`Jwt:RefreshTokenDays`), are stored only as a SHA-256 hash and are rotated on every use.
- Tokens carry a version claim. Changing a user's role or password, or deactivating the account, invalidates their tokens immediately.
- Passwords need 8+ characters with at least one letter and one digit.
- After 5 failed logins an account is locked for 15 minutes (`Auth:MaxFailedAttempts`, `Auth:LockoutMinutes`); the login, register, refresh and change-password endpoints are limited to 30 requests per minute per IP (`RateLimit:AuthPerMinute`).
- Token storage for single-page apps: keep the access token in memory and the refresh token in `sessionStorage` (or an httpOnly cookie if you add a BFF). Password reset by email is not implemented.

## API overview

Enums are serialized as strings (`"Published"`, `"Paid"`, `"DNF"`...). Errors follow RFC 9457 ProblemDetails (`{ "title", "status", "detail" }`; validation errors add `errors`).

| Method | Route | Access |
| --- | --- | --- |
| POST | `/api/auth/register` | Public. Always creates a `Participant`; optional `dateOfBirth`, `gender`, `phone` |
| POST | `/api/auth/login` | Public. Returns a 15 minute access `token` and a rotating `refreshToken` |
| POST | `/api/auth/refresh` | Public. Exchanges a refresh token for a new pair; reusing an old one revokes them all |
| POST | `/api/auth/logout` | Public. Revokes the given refresh token |
| GET / PUT | `/api/auth/me` | Authenticated. Read or update your profile |
| POST | `/api/auth/change-password` | Authenticated. Signs you out everywhere |
| GET | `/api/users?search=&role=&page=` | Admin |
| PUT | `/api/users/{id}/role`, `/api/users/{id}/active` | Admin. Effective immediately (the user's tokens are invalidated); not allowed on yourself |
| GET | `/api/venues`, `/api/venues/{id}` | Public |
| POST / PUT / DELETE | `/api/venues` | Admin, Organizer (delete: 409 if events use it). `timeZone` is an optional IANA id such as `Africa/Johannesburg`, validated by the server |
| GET | `/api/events?search=&status=&from=&to=&newestFirst=&mine=&page=&pageSize=` | Public (paged). Each item carries `categoryCount`, `minEntryFee`, `spotsLeft` and `registeredCount`; `mine=true` limits it to the caller's own events (limited by category and venue capacity, null = unlimited). Drafts only for their owner and admins |
| GET | `/api/events/{id}` | Public. Includes `categories[]` with `registeredCount` and `spotsLeft` |
| POST / PUT | `/api/events` | Admin, Organizer (multipart form, optional `imageFile`). New events are drafts owned by the caller; only the owner or an admin may edit |
| POST | `/api/events/{id}/publish`, `/cancel`, `/complete` | Owner or Admin. Publish needs a future date and at least one category |
| DELETE | `/api/events/{id}` | Admin (409 if the event has registrations) |
| GET | `/api/categories?eventId=` | Public (categories of drafts are hidden) |
| POST / PUT / DELETE | `/api/categories` | Event owner or Admin (delete: 409 if registrations exist) |
| GET | `/api/registrations` | Authenticated: your own registrations with event date and status, entry fee and `canCancel` (admins can add `?all=true` for everyone's) |
| POST | `/api/registrations` | Authenticated, body `{ "categoryId": 1 }`. Checks published status, registration window, category and venue capacity, age and gender |
| DELETE | `/api/registrations/{id}` | The participant (until registration closes) or the event owner/admin; blocked once a result exists |
| PATCH | `/api/registrations/{id}/payment` | Event owner or Admin, body `{ "paymentStatus": "Paid" }` |
| GET | `/api/events/{id}/registrations?categoryId=&paymentStatus=&format=csv` | Event owner or Admin |
| POST | `/api/results` | Event owner or Admin. Records a time or a `DNF`/`DNS`/`DSQ` status and recalculates ranks |
| PUT / DELETE | `/api/results/{id}` | Event owner or Admin |
| POST | `/api/results/import?eventId=` | Event owner or Admin. Multipart CSV `file` with `raceNumber,finishTime[,status]` (times as `mm:ss` or `h:mm:ss`, fractions allowed) |
| GET | `/api/results/mine` | Authenticated: your own results with place and number of finishers |
| GET | `/api/results/event/{eventId}` | Public (non-draft events) |
| GET | `/api/results/leaderboard/{categoryId}` | Public. Only finished results |
| GET | `/api/stats` | Admin |

Equal finish times share a rank (1, 2, 2, 4). Race numbers are unique per event and are never reused.

## Tests

```bash
dotnet test RaceDayApi.Tests
dotnet test RaceDayApi.Tests --filter "FullyQualifiedName~FullRaceFlow"   # a single test
```

Integration tests use `WebApplicationFactory` with an in-memory SQLite database (migrations included) and a fake blob service, so no external services are required. They include a concurrency test (12 simultaneous registrations on a file-backed database get unique race numbers and never exceed the capacity) and SPA hosting tests.

End-to-end tests (Playwright) drive the real app: a fresh API database and the Vite dev server are started for you.

```bash
cd frontend
npm run e2e          # uses the installed Google Chrome; in CI: npx playwright install --with-deps chromium
```

They cover the golden path (an organizer creates, publishes and runs a race; a participant registers and sees the result), access control and the session (reload, logout, password change). The CI workflow runs the API tests, the frontend checks, the e2e suite and a Docker build with a smoke test of the container.

## Frontend

React 19 + TypeScript + Vite, with React Router, TanStack Query and hand-written CSS built on design tokens (dark by default, light via the header toggle or the OS preference).

```bash
cd frontend
npm run dev      # needs SERVER_HTTP/SERVER_HTTPS (set by the AppHost, or by hand, see Quick start)
npm run lint     # eslint
npm test         # vitest (api client, auth guard, UI components)
npm run build    # tsc -b && vite build
```

```
src/
  app/          router (lazy routes), providers, app shell, route guard, error boundary
  components/   EventCard + ui/ (Button, fields, Card, Badge, Modal, Toast, Tabs, DataTable, Pagination, ...)
  features/     auth (AuthProvider, useAuth), theme
  lib/          api client, session storage, types mirroring the API, formatters
  pages/        route components (each exports `Component` and is its own chunk)
  styles/       tokens.css (colors, type, spacing, motion) and base.css
```

- `lib/api.ts` is the only place that calls `fetch`: it adds the bearer token, refreshes it once on 401 (a single refresh is shared by concurrent requests) and throws `ApiError` with a message that is safe to show.
- The access token lives in memory; the refresh token in `sessionStorage`, so a reload keeps you signed in for the tab.
- In development, open `/design` for a showcase of every component and token.
- Forms with unsaved changes (event editor, profile details) ask before you leave the page, and the browser prompts on tab close or reload.
- Cancelling a registration and changing a payment status update the screen immediately and roll back (with an error toast) if the server refuses.
- Each page sets its title, description and Open Graph tags (the event banner is the preview image). These are applied in the browser, so link-preview bots that do not run JavaScript would need server-side rendering.
- Accessibility: the pages were checked with axe-core (WCAG 2.1 A/AA) in both themes with no violations, and for horizontal overflow at 320, 360, 768 and 1280 px. Motion is disabled under `prefers-reduced-motion`.

| Route | Page |
| --- | --- |
| `/` | Next race with a live countdown, upcoming events, how it works |
| `/events` | Search, Upcoming / Past / All filter (kept in the URL), paged cards with spots left, distances and price |
| `/events/:id` | Banner, about, categories table (distance, start, fee, eligibility, spots), registration panel and venue. Signed-in users can register through a confirm dialog |
| `/events/:id/results` | Category tabs, podium, ranked table with gaps and DNF/DNS/DSQ, search by name or bib; refreshes every 30 s while the event is live |
| `/login`, `/register` | Authentication |
| `/me/registrations` | My races: Upcoming / Past / Cancelled with race number, payment status, entry fee hint and cancel (confirm dialog; only while the server says it is allowed) |
| `/me/results` | Races finished, podiums, best place and a table with time and place ("2nd of 14") |
| `/me/profile` | Edit details (date of birth and gender drive category eligibility, emergency contact) and change password (signs you out everywhere) |

Registering on an event page ends with a dialog showing your race number.

Organizer and admin area (roles `Organizer`/`Admin`; the header shows **Manage**):

| Route | Page |
| --- | --- |
| `/manage` | Events as cards (banner, date, venue, status and a progress bar of registrations when the event has a meaningful limit) with a "needs your attention" strip (races run but not closed, races starting this week, drafts ready to publish, drafts without categories), a status filter with counts, search, and platform stats for admins. Organizers see their own events, admins all |
| `/manage/events/new` | Create an event as a draft (venue picker, registration window, banner with preview) |
| `/manage/events/:id` | Compact header with breadcrumb, a Draft / Published / Completed stepper and one primary action (Publish, or Mark completed); Cancel and Delete (admins) live in the "More actions" menu. A "ready to publish?" checklist shows for drafts. Tabs carry counts: Categories (n), Registrations (n), Results (recorded/registered) |
| `/manage/events/:id` (Details) | Edit the event; locked once it is cancelled or completed |
| `/manage/events/:id/categories` | Add, edit and delete categories (fee, distance, start, capacity, age and gender rules) |
| `/manage/events/:id/registrations` | Participants with search, category/payment filters, inline payment status, cancel on behalf, CSV export |
| `/manage/events/:id/results` | **Race day** view: progress bar of runners with a result, clickable chips for the runners still to record (fills the bib), large bib and time fields, Finished/DNF/DNS/DSQ always visible, a "just recorded" list, the live leaderboard (category switcher), edit/remove, and CSV import tucked into a collapsible section |
| `/manage/venues` | Venues as cards (capacity, time zone) with search; add, edit and delete (including the IANA time zone: event times are local to it and the event page says so) |
| `/manage/users` | Admins only: search users, filter by role with counts, change role, activate/deactivate (effective immediately, never on yourself) |

## Database migrations

```bash
dotnet tool install --global dotnet-ef
dotnet ef migrations add <Name> --project RaceDayApi.Server
```

Migrations are applied automatically at startup.

## Troubleshooting

- **`dotnet: command not found`**: install the .NET 10 SDK (link in Prerequisites) and open a new terminal; `dotnet --version` must print `10.x`.
- **Aspire says "Container runtime unhealthy"**: Docker is not running. Start Docker, or use Option C, which does not need it.
- **Port already in use** (5398, 7375, 5173, 8080): stop the previous run (`Ctrl+C`) or the process holding the port.
- **`vite: Permission denied`**: run `chmod +x frontend/node_modules/.bin/*`.
- **`Jwt:Key must be configured...`**: set `Jwt:Key` (see Configuration) or run in the `Development` environment.
- **Browser warns about the certificate**: run `dotnet dev-certs https --trust`.
- **`table already exists` on an old database**: older versions created the schema without migrations. Delete `RaceDayApi.Server/raceday.db` and restart.
