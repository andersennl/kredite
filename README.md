# Kredite

A small, self-hosted loan portfolio tracker. Enter your loans once — principal, interest rate, monthly payment, start date — and get a live overview of balances, amortization schedules, total interest cost, and which loan to pay off first.

Built with Svelte 5, Chart.js, Express, and SQLite. Ships as a single Docker container.

> **Note:** The user interface is currently in German.

## The problem

If you have more than one loan — a mortgage, a car loan, a family loan — the numbers that actually matter are surprisingly hard to see:

- How much do I still owe *across all loans, right now*?
- How much interest will each loan cost me in total, and how much is still ahead of me?
- If I have spare money, **which loan should I pay down first**?
- When will I actually be debt-free?

Banking apps show one loan at a time, and spreadsheets rot. Kredite computes full amortization schedules from just four numbers per loan and answers these questions on one page.

## Who it's for

- **Households with several loans** who want a single, honest overview instead of scattered bank portals.
- **Self-hosters** who don't want to hand their financial data to a SaaS — everything stays in one SQLite file on your own machine.
- Anyone deciding **where an extra repayment helps most**: loans are ranked by remaining interest cost.

## Features

- Portfolio dashboard: total balance, monthly payment load, total and remaining interest, projected payoff date.
- Full amortization schedule per loan, computed on the fly (no schedule data to maintain).
- Balance-over-time chart for the whole portfolio (Chart.js).
- Payoff priority list — loans sorted by how much remaining interest they will still cost you.
- Handles interest-only loans (payment = 0) explicitly instead of producing nonsense numbers.
- Single SQLite file as the only state; trivial to back up.

## Installation

### Option 1: Docker Compose (recommended)

```bash
git clone https://github.com/andersennl/kredite.git
cd kredite
docker compose up --build
```

The app is then available at `http://localhost:3000`. The SQLite database lives at `/data/kredite.sqlite` inside the container; by default it is stored in `./data` on the host. Set `KREDITE_DATA_DIR` to use another host path:

```bash
KREDITE_DATA_DIR=/path/to/volume docker compose up --build
```

### Option 2: Local development

Requires **Node.js 22** (the version the Docker image uses; `better-sqlite3` 11.x does not build on newer Node majors).

```bash
npm install
npm run dev
```

This starts the Express API (with `node --watch`) and the Vite dev server concurrently. For a production build: `npm run build && npm start`.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port of the server |
| `DATA_DIR` | `./data` (`/data` in Docker) | Directory for `kredite.sqlite` |

There is no authentication — run it on a trusted network or behind a reverse proxy with auth (see roadmap).

## Tests

The financial core (amortization, portfolio totals, payoff priority, formatting) lives in [src/lib/calculations.js](src/lib/calculations.js) and is covered by Vitest:

```bash
npm test
```

If you touch the calculation logic, add a test case — that file is the part of the project where silent mistakes cost real money.

## API

The server exposes a small JSON API, used by the frontend and usable for scripting:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/loans` | List all loans |
| `POST` | `/api/loans` | Create a loan |
| `PUT` | `/api/loans/:id` | Update a loan |
| `DELETE` | `/api/loans/:id` | Delete a loan |

A loan is `{ name, startDate, principal, annualRate, monthlyPayment }`. All schedule math happens client-side from these five fields.

## Roadmap

Rough order; none of this is promised. Open an issue if one of these matters to you.

- [ ] **English UI / i18n** — the calculations are locale-independent, the labels are not yet.
- [ ] **Extra repayments (Sondertilgungen)** — one-off payments that recompute the schedule from that point.
- [ ] **Fixed-interest periods (Zinsbindung)** — model a rate change after N years instead of assuming one rate for the whole term.
- [ ] **CSV/JSON export** of loans and schedules.
- [ ] **Optional authentication** for exposing the app beyond localhost.
- [ ] **Prebuilt container image** on a registry.
- [ ] **Upgrade `better-sqlite3`** to a version that builds on current Node majors.

## Contributing

Issues and pull requests are welcome. Keep it small and focused:

1. Fork, branch, make your change.
2. `npm test` must pass; add tests for any change to `src/lib/calculations.js`.
3. Open a PR describing what problem the change solves.

## License

[MIT](LICENSE) © Nikolaj Andersen
