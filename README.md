# Kasel OS

Kasel OS is an agency workspace for Kasel Digital Solutions. This first web build includes a demo executive dashboard, departmental views, editable projects and tasks, a due-date agenda, review notifications, search, and light and dark modes.

## Development workspace

Open **Development** and select a product. Use **New project** to create additional products. Product settings accepts an HTTPS GitHub repository URL and provides direct links to its pull requests and activity.

Use **Sprints** to define an iteration, then assign tasks to it in the task editor. The Tasks view groups work into the backlog and sprints. Roadmaps, bugs, feature requests, releases, QA, documentation, incidents, and time logs are scoped to the selected product. CI deployments and live GitHub synchronization require a backend integration.

## Marketing and creative workspace

Open **Social Media** or **Content** to set up a brand, write campaign objectives and creative briefs, compose posts, and track HTTPS asset links by version. Both departments share brand records. Attach a specific asset version to keep the reviewed deliverable stable as new versions are added.

Submit posts or briefs for internal review, then record the client's decision. Changes to reviewed content restart the review. The content calendar uses West Africa Time. Scheduling and publication are recorded manually, and the performance view summarizes manually entered post metrics by publication month. Shared file storage, client sign-in, and social platform APIs are pending.

## Client and business workspace

Open **Operations** to manage leads and clients, track proposals, contracts, invoices, retainers, expenses, and payroll, and record partial payments in NGN. Profitability shows recorded invoice payments minus paid expenses and payroll, with client and project filters.

Use **Client portal preview** to inspect a client's shared projects, milestones, deliverables, approvals, and issued invoices, and to simulate requests, issues, messages, and decisions. Grant projects from the client editor, then explicitly share each client-facing record. The preview uses local demo data. Client sign-in, server-side access controls and audit storage, payment processing, and document delivery require a backend.

## Assistant and automation

Open **Assistant** for local reports, recent report runs, and review reminders. To draft tasks, paste one brief item per line, preview and edit the titles, then confirm before creation.

Optional model drafting uses OpenRouter from the local Vite development server. Set `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` in the server process environment through your local secret manager or shell, then start Vite bound to loopback with `npx --no-install vite --host 127.0.0.1`. The key is server-side. Each request sends the displayed prompt and editable context to OpenRouter. Use sample data. Reports and local reminders work without provider credentials.

Production model access, scheduled background jobs, and Resend email delivery require an authenticated backend.

## Install the web app and export data

Build with `npm run build`, serve `dist/` over HTTPS, and open **Settings**. After the first successful load and cache setup, the app can start offline and continue using the records saved in that browser. Use your browser’s install option or Add to Home Screen. When an update is ready, apply it from Settings to reload onto the new version. Local development uses Vite's live reload.

**Export workspace JSON** downloads versioned data from the current browser. The file can contain contacts and financial records. It includes stored asset links, and linked files are downloaded separately through their providers.

## Prepare native projects

The Capacitor configuration uses `dist/` and the provisional application ID `com.kaseldigital.workspace`. Confirm the identifier before store registration. With the Android SDK and Android Studio installed, run `npm run build`, `npx cap add android` once, then `npx cap sync android` after web builds. On macOS with Xcode, run `npx cap add ios --packagemanager SPM` once, then `npx cap sync ios` after web builds. Open the generated project with `npx cap open android` or `npx cap open ios` to build and sign it.

Native signing, device testing, subscriptions, and self-service tenant onboarding are pending. The web app remains a browser-local demo.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run `npm run build` to type-check the application and produce the production bundle in `dist/`.

The demo saves changes in this browser's local storage. Use it with sample data only. Sign-in, shared storage, and tenant permissions are pending. See [the master development brief](docs/master-development-brief.md) for the implementation roadmap.
