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

A team workspace shares its projects and tasks with every member. Editors and owners save explicitly, and older revisions cannot overwrite newer saves. Viewers can browse and export the records they can see. Private client, finance, creative, development, and assistant records remain in the private workspace. Use a restricted project workspace for project-specific access. Ownership transfer remains pending.

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

Apply `202611260008_require_private_workspace_access.sql` to make new users team-only. Use invite-based account setup below, or provision and confirm their Supabase Auth account and then invite their email from the appropriate team. After sign-in, they can accept invitations and open teams they belong to. They cannot read or create a private workspace or create teams. Existing team owners and accounts with saved private workspaces retain their administrator access.

To grant administrator access to a future administrator, a database administrator can insert that user's Supabase Auth ID into `public.workspace_admin_access (user_id)`. The user can then sign out and back in to pick up the grant.

### Invite-based account setup

Apply `202611260009_invite_signup.sql` and, in Supabase **Authentication → Hooks**, enable the **Before User Created** PostgreSQL hook `public.require_team_invitation_on_signup`. Enable email signups and keep **Confirm email** enabled. Verify the production URL is allowed as a redirect. Configure custom SMTP in Supabase for production confirmation email delivery.

A team owner creates an invitation and chooses **Copy invite link** to share it with the intended recipient. The recipient chooses a password, confirms their email, and accepts the team invitation. Existing users can sign in from the invite link. The hook requires a live invitation for the exact email before a new user can sign up. It also applies to account creation in ways that invoke the same Supabase hook. The app copies links for owners to share. Supabase sends the signup confirmation email.

## Team task discussion

Apply `202611260010_task_discussions.sql`. Open a saved task in a shared team workspace to read its discussion. Owners and editors can post and choose teammates to mention. The recipient sees an in-app notification that opens the relevant comment. Comments and notification reads save immediately, independently of **Save to cloud**. The notifications list checks periodically while the app is open.

### Password recovery

From **Sign in → Forgot password?**, request a reset link and open it in the same browser. The recovery link opens the password form before loading any workspace. Existing password sign-in works without email delivery. Password recovery uses Supabase Auth email delivery and the existing allowed app redirect URL. Test email delivery before relying on recovery for staff.

### Invitation status

After applying `202611260011_team_invitation_history.sql`, team owners can see pending and expired invitations and the 20 most recent acceptances in **Manage**. Acceptance history starts when the migration is applied and is visible only to the team owner.

### Restricted projects

Apply `202611260012_restricted_project_workspaces.sql`. Workspace administrators can choose **Restricted project** under **Switch workspace → Create workspace**. Each restricted workspace contains one new project, with its own members, invitations, tasks, discussions, and activity. Invite the required people from that workspace’s **Manage** panel. Membership in a different workspace does not grant access. Existing projects can continue in their current workspaces.

## Deliverable reviews

Apply `202611260013_team_deliverable_reviews.sql`. Open a saved task in a shared or restricted workspace and choose **Request review**. Include a version-specific HTTPS deliverable link and pick another member of that workspace. The assigned reviewer gets an in-app notification and can approve or request changes. Review records are visible to the requester, reviewer, and workspace owner. A viewer can make a decision when assigned as reviewer. Request a new review for a revised deliverable. Give an external reviewer access only to a restricted workspace dedicated to their project, and manage file access through the provider that hosts the link.

## Task dependencies

Open a task and choose what it **Depends on**. Dependencies link tasks in the same project. A task displays **Blocked** while it and at least one dependency are open. Use **Blocked only** on the Board, Tasks, or Calendar to triage that work. Moving a task to another project removes its links to the previous project. Dependencies use the existing workspace save flow.

## Project timeline

Open **Timeline** and use the existing project, status, priority, or assignee filters to plan the month. Tasks with start and due dates cover that range. Tasks with a single date appear on that day, and undated tasks are listed separately. Open any task to see its details or edit its dates if your role permits. Timeline edits follow the existing workspace save flow.

## My Work

In a shared or restricted workspace, open **My Work** to see tasks assigned to your account. Filter for open, overdue, blocked, or completed work. The same screen shows pending deliverable reviews and unread discussion alerts and opens the relevant task directly.

## Task templates

From **Projects**, **Tasks**, or **Board**, choose **Use a task template**. Select a destination project and a template, preview tasks and checklists, and deselect unwanted tasks. An optional schedule date sets deadlines relative to the kickoff. Tasks are added as unassigned To do items. In a shared workspace, use **Save to cloud** to share the new tasks.

### Mention emails with Postmark

Apply the mention email migrations `202611260014` and `202611260015` in order. The job sends one email per new mention to a current team member with a confirmed email. It leaves task and comment contents in Kasel OS. In-app mentions continue to work independently of delivery.

Create a separate **Postmark Server API Token** for the transactional server and add it in Supabase **Vault** as `kasel_postmark_server_token`. The SMTP credentials used by Supabase Auth stay separate. The job uses the verified sender `hello@kasel.digital` and checks the queue every minute. It ignores invitations and other account messages, which still use Supabase Auth. Historical mentions are excluded. Unsent jobs expire after 24 hours. A Postmark rate-limit response is retried, and ambiguous delivery failures are recorded for investigation.

## Team chat and comment alerts

Apply `202611260016_team_chat_and_comment_notifications.sql`. After opening a team or restricted project workspace, choose **Open team chat** in the workspace header or **Chat** in the sidebar. Owners and editors can post messages, and viewers can read them. Chat messages save immediately. The notification bell groups unread chat messages for the open workspace. Opening chat marks the messages it loads as read for that account.

New task comments notify the current assignee and teammates who previously posted in that discussion. Explicit mentions notify the selected teammates and continue to queue mention emails. The author does not receive their own alert. Teammates can open the comment from the notification bell or **My Work**. Chat uses Realtime and provides a refresh button if the connection is unavailable.

### Pinned chat messages

Owners and editors can pin one message per room, replace it, or unpin it. The pinned message appears above the conversation for all workspace members, including viewers. Pinning does not add unread messages.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run `npm run build` to type-check the application and produce the production bundle in `dist/`.

The demo saves changes in this browser's local storage. Use it with sample data only. Private cloud sign-in is available when configured. Team projects and tasks can be shared when Supabase is configured. See [the master development brief](docs/master-development-brief.md) for the implementation roadmap.
