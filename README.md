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

Native signing, device testing, subscriptions, and self-service tenant onboarding are pending. Browser demo mode remains available alongside the optional private workspace pilot.

## Private workspace pilot

Apply the migration in `supabase/migrations/` to your Supabase project. In Supabase Auth, provision pilot users and allow the deployed app's root URL as a sign-in redirect. Keep email link sign-in enabled. Set the public build variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then rebuild. Use a Supabase **publishable** key. Set these variables in the hosting provider as well as in any Codex environment used for development. Redeploy after changing them because Vite reads them at build time. With both variables omitted, **Sign in** opens Settings and explains that cloud sign-in is unavailable in that build.

Signed-out users start in the browser demo. Use **Sign in** in the top bar to authenticate and open your private cloud workspace. The sign-in form opens with email and password. Custom SMTP is optional for password sign-in. Configure a verified sender with your SMTP provider and add those credentials in Supabase Auth when you need reliable email delivery. Users without a password can choose **Use a sign-in link** and open the email link in the same browser used to request it, then set a password from **Settings** for future sign-ins. Workspace administrators can use a private workspace and must use **Save to cloud** to persist changes. Staff accounts open the team picker after sign-in. A stale browser tab cannot overwrite a newer save through the app. Export unsaved work before reloading after a conflict. The browser demo has separate records. OpenRouter drafting stays in the demo.

This pilot stores one owner-only snapshot per user. Team workspaces use separate records. Granular project and finance permissions and automatic demo data import are pending. For a shared production deployment, finish those controls before inviting client or team users.

## Team workspace pilot

Apply the Supabase migrations in order. Sign in with a provisioned, verified account and use **Switch workspace** to create a team or accept an invitation. Team owners grant viewer or editor access, change roles, and remove members. After applying `202611260006_delete_team_workspace.sql`, owners can delete a team from its management panel. The confirmation shows the workspace contents before it permanently removes shared records, memberships, invitations, and activity. Invitations are matched to the recipient’s verified email and expire after seven days. Signed-in recipients can use **Review invitations** in their private workspace or open **Switch workspace → Invitations**. Accepting opens the shared team. Kasel OS does not send an invitation email.

A team workspace shares its projects and tasks with every member. Editors and owners save explicitly, and older revisions cannot overwrite newer saves. Viewers can browse and export the records they can see. Private client, finance, creative, development, and assistant records remain in the private workspace. Project-specific access and ownership transfer remain pending.

### Team assignments

After applying `202611260003_team_task_assignment.sql`, team owners and editors can assign a shared task to a team member and save it to the cloud. **Workload** shows open and overdue counts and opens the corresponding task list. Team members can see assignee labels, which are the verified email addresses used for membership. Removing a member clears their assignments and advances the workspace revision so older tabs cannot restore them by saving a stale snapshot.

### Live team updates

Apply `202611260004_team_live_updates.sql` to enable Supabase Realtime for team workspaces. A teammate's cloud save refreshes clean copies of the workspace. If you have unsaved edits, Kasel OS keeps them open and lets you export them before loading the newer version. Open forms are kept intact until you close or save them. Use **Check for updates** if Realtime is unavailable. Saves still use revision checks, and private workspace data stays out of the team subscription.

### Team activity

Apply `202611260005_team_activity.sql` to enable the **Activity** view. It records future team creation and shared project or task changes with their revision, time, and verified actor label. Team members can read their own team's history. The log starts at installation and stores change counts without copying record contents. Client-side users cannot edit or delete it.

## Task board

Open **Board** to group tasks by status and filter by project, priority, or team assignee. Move tasks by dragging a card on desktop or using its status dropdown. Tasks without a saved priority display as Normal. Changes follow the workspace's existing save behavior, and team viewers can browse the board with read-only access.

## Task details and checklists

Open a task from the list or board to add a brief and a checklist. Check items off as work progresses. Board cards show checklist progress. Viewers can open task details, including the description and checklist. Team edits follow the existing **Save to cloud** workflow.

## Production domain

The canonical site is `https://os.kasel.digital/`. Add `os.kasel.digital` to the Kasel OS Vercel project's **Domains** settings and configure the exact DNS record Vercel shows. Wait for Vercel to verify the domain and issue its HTTPS certificate.

In Supabase **Authentication → URL Configuration**, set **Site URL** to `https://os.kasel.digital` and allow `https://os.kasel.digital/` as a redirect URL. Keep `https://kaselos.vercel.app/` allowed while it still serves the app. Start and finish email sign-in on the same origin because the sign-in request is tied to its browser. Existing users sign in again on the new hostname. Save pending cloud edits on the old hostname before switching. Browser demo records and installed web apps are also specific to their origin.

### New staff access

Apply `202611260008_require_private_workspace_access.sql` to make new users team-only. Provision and confirm their Supabase Auth account, then invite their email from the appropriate team. After sign-in, they can accept invitations and open teams they belong to. They cannot read or create a private workspace or create teams. Existing team owners and accounts with saved private workspaces retain their administrator access.

To grant administrator access to a future administrator, a database administrator can insert that user's Supabase Auth ID into `public.workspace_admin_access (user_id)`. The user can then sign out and back in to pick up the grant.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run `npm run build` to type-check the application and produce the production bundle in `dist/`.

The demo saves changes in this browser's local storage. Use it with sample data only. Private cloud sign-in is available when configured. Team projects and tasks can be shared when Supabase is configured. See [the master development brief](docs/master-development-brief.md) for the implementation roadmap.
