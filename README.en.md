# Mappleo

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/ESP-Español-0f766e?style=for-the-badge" alt="Español"></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/ENG-English-334155?style=for-the-badge" alt="English"></a>
</p>

<p align="center"><strong>Your job search, organised. On the web or on your computer.</strong></p>

Mappleo brings companies, job offers, applications, contacts and networking together, with a Kanban board, calendar and reports. A project built to replace scattered spreadsheets and make your next step clear.

## Download Mappleo for Windows

<p align="center">
  <a href="https://github.com/adrianvilellapro/Mappleo_App/releases/download/v0.1.1/Mappleo-Setup-0.1.1.exe"><img src="https://img.shields.io/badge/Windows-Download_installer_v0.1.1-0f766e?style=for-the-badge&logo=windows" alt="Download Mappleo for Windows"></a>
</p>

**A real Windows application that works without an internet connection.** Download the installer, open it and create a local profile: no commands, Docker, external database or web account required.

- Data is stored encrypted on your computer.
- Optionally link your web account to sync your tracking data when online. Offline changes sync when you reconnect; conflicts requiring a decision are shown for you to resolve.
- Disconnect your account and keep working locally.
- **Files** keeps CVs and cover letters on your computer only, with previews and links to job offers. Files and their associations **are never uploaded or synced to the web**.
- Includes side-panel records, tasks, custom columns, statistics and JSON/CSV backups.

Supports 64-bit Windows 10/11. Installer in English and Spanish; application interface in Spanish. This beta is not digitally signed, so Windows may show a SmartScreen warning. Download only from the official Release and check the attached SHA-256 file. Updates currently require a new installer; automatic updates are not implemented.

## Try it in your browser, without signing up

<p align="center">
  <a href="https://adrianvilellapro.github.io/Mappleo_App/en/index.html"><img src="https://img.shields.io/badge/DEMO-Try_in_English-0f766e?style=for-the-badge" alt="Open English web demo"></a>
  <a href="https://adrianvilellapro.github.io/Mappleo_App/es/index.html"><img src="https://img.shields.io/badge/DEMO-Probar_en_español-334155?style=for-the-badge" alt="Abrir demo web en español"></a>
</p>

**An exclusively web-based, static demo** featuring the fictitious John Miller profile and six months of activity: 24 companies, 64 job offers, 54 applications, 36 contacts, 18 events, 34 tasks and a history of 64 completions.

Create and edit records, link them, complete tasks, move cards and explore the calendar and statistics. Changes stay temporarily in this browser tab for **up to 30 minutes**; sample data is restored automatically on expiry. There are no real accounts, sync, file uploads or API calls. Do not enter personal information. This is not a downloadable Windows demo.

The demo is available on **GitHub Pages**, separately from the web application: **it is not part of the Vercel service**. The `gh-pages` branch contains the ready-to-serve site, with no keys or services.

[Open the real web application](https://mappleo.vercel.app) · Requires an account and a private registration code.

## What you can do

- **Companies and offers:** related records, links, notes, star ratings, technologies and filters.
- **Applications:** multiple processes for an offer, statuses, dates, history and collapsible notes.
- **Today:** live metrics, calendar and pending Kanban tasks.
- **Kanban:** custom columns, draggable cards, completion tracking and linked records. Create an action from any record.
- **Contacts and networking:** connected people, companies and events.
- **Statistics:** trends by period, source and company; applications, networking, technologies and completed tasks. PDF reports on the web.
- **Backups and exports:** compatible web/Windows JSON, duplicate-free restoration and CSV. The web also includes PDF and password-protected backups.
- **Experience:** light/dark mode, search, side panels and keyboard shortcuts. Responsive web app and demo.

## Security and privacy

The web app validates permissions and input on the server, uses Argon2id password hashing, AES-256-GCM encryption for personal fields, HTTPS and attempt limits. Administration has separate access and stronger authentication. Windows sync requires authorisation and can be revoked.

Encryption is not end-to-end. Unprotected exported backups and temporary demo data are not secure storage. The demo contains invented information only.

## Technologies and structure

| Edition         | Technologies                                      | Source                             |
| --------------- | ------------------------------------------------- | ---------------------------------- |
| Web             | Next.js, React, TypeScript, PostgreSQL and Prisma | `app/`, `features/`, `lib/`        |
| Windows         | Electron, React and encrypted local SQLite        | `apps/windows/`                    |
| Static web demo | React and Vite; no backend                        | `apps/demo/`                       |
| Shared          | Entities, Zod validation, sync and data rules     | `packages/domain/`, `packages/ui/` |
| Tests           | Vitest and Playwright, including Electron         | `tests/`, `apps/windows/tests/`    |

To work from source, install **Node.js 24**.

To develop Windows: `npm run desktop:install`, then `npm run desktop:dev`. Build its installer with `npm run desktop:dist`.

To preview the web demo: `npm ci`, `npm run demo:build`, then `npm run demo:preview`. No PostgreSQL, keys or environment variables required. Generated `apps/demo/dist/` contains the complete static site. Its contents are published at the root of the `gh-pages` branch, separate from the source code.

### Enable the demo on GitHub Pages

Under **Settings → Pages → Deploy from a branch**, select **`gh-pages`** and **`/(root)`**, then save. Do not select `main`: its root contains the source, not the demo. No Vercel, PostgreSQL or environment variables are needed.

## Current status

**v0.1.1 · Functional beta.** Deployed web app, offline Windows application with optional sync, local-only files and an interactive web demo in English and Spanish.

Still planned: email verification and email-based password recovery, installer signing and automatic updates, MFA for regular users and external integrations. The demo does not include administration, accounts, files or exports.

## Author

Created by **Adrián Vilella Espony**.

[GitHub · adrianvilellapro](https://github.com/adrianvilellapro)
