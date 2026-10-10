# Lavamex POS

Point-of-sale system for the Lavamex car wash: ticket capture, cashier, cash counts, expenses, payroll and business reports. It runs entirely in the browser (tablets and desktop) on top of Firebase Firestore.

Live at **https://lavamex.work**

## Pages

| File | What it is |
|---|---|
| `index.html` | The POS itself. All roles log in here. |
| `analytics.html` | Business reports (revenue, expenses by category, labor, trends). Admin password required. |
| `menu.html` | Customer-facing price list for the lobby tablet. **Static**: its prices are written in the file and do **not** follow the Precios screen. |
| `manifest.json`, `icons/` | Lets the POS be installed as an app on tablets. |

There is no build step: each page is a single HTML file that loads React, Tailwind, Firebase and the other libraries from CDNs and compiles its code in the browser.

## Deploying

The site is served by **GitHub Pages** from the `main` branch (custom domain in `CNAME`).

- Every push to `main` is live in about a minute.
- Open tablets keep running the old version until they **reload the page**.

## Roles

| Role | Opens | Used for |
|---|---|---|
| **Entrada** | Ticket capture | Creating tickets: vehicle, size, service, extras, washers. |
| **Caja** | Cashier | Charging tickets (cash MXN/USD, card), expenses, cash drops, cash counts (arqueos), courtesy requests. |
| **Admin** | Admin panel | Everything, plus approvals, reports, payroll and configuration. |

Admin panel sections:

- **Aprobaciones**: pending expenses, staff snacks/pinos and courtesy washes.
- **Reportes**: Corte, Nómina, Asistencia, Mercancía, Historial Gastos, Agregar Efectivo.
- **Configuración**: Empleados, Usuarios POS, Cambio (exchange rate and snack price), Precios.

## Logging in

Users and passwords live in the Firestore collection `pos_credentials` and are managed from **Admin → Configuración → Usuarios POS**.

- Each user has a nickname, a password, a role (`entrada`, `caja` or `admin`) and an Activo/Inactivo switch.
- `analytics.html` accepts any active `admin` user.
- The last active admin cannot be disabled or demoted from the app. If an admin is ever locked out, fix their document directly in the Firebase console.
- Sessions expire at the end of the day; Caja and Admin also expire after 45 minutes without use.

## Data (Firestore)

| Collection | Contents |
|---|---|
| `tickets` | One per vehicle. `status`: `PENDING` → `PAID` (or `CANCELLED`). Price and commission are saved on the ticket when it is created. |
| `expenses` | Cash expenses from the register (MXN and/or USD), pending admin approval. |
| `business_expenses` | Administrative expenses paid outside the register (do not affect the daily cash count). |
| `cash_counts` | Arqueos (declared cash). |
| `cash_drops` / `cash_ins` | Cash taken out of / added to the register. |
| `deductions` | Payroll deductions (snacks, advances). |
| `attendance` | Daily attendance. |
| `employees` | Washers, supervisors and boleros. |
| `admin_snacks`, `cortesias` | Approval requests. |
| `settings` | `prices`, `commissions`, `general` (exchange rate, snack price). |
| `extras` | Extra services and their prices/commissions (one document per extra). |
| `pos_credentials` | POS users (see above). |

## Making common changes

- **Prices and commissions** (services and extras): Admin → Configuración → Precios, then GUARDAR. Other tablets pick up new prices after a reload.
- **Exchange rate / snack price**: Admin → Configuración → Cambio.
- **Users**: Admin → Configuración → Usuarios POS.
- **Expense categories**: `EXPENSE_CATEGORIES` in `index.html` **and** `analytics.html` (the two lists must match).
- **Adding a new extra or service**: add it to `DEFAULTS` in `index.html`. Extra names come from the code; prices come from Firestore once saved in Precios.
- **Lobby price list**: edit `menu.html` by hand.

## Security notes

- The Firebase config in the pages is public by design; it is not a secret. Protection comes from Firestore Security Rules.
- The current rules allow reads and writes only to the collections above and block all deletes except `admin_snacks`. The app does not yet use Firebase Authentication, so the rules cannot tell users apart.
- **Never commit secrets** (API keys, service-account files, passwords). This repository is public.
