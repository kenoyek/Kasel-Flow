# Kasel OS master development brief

Build a multi-tenant agency and product management platform for Kasel Digital Solutions. Kasel is the first tenant. Each future organization owns its branding, employees, departments, clients, projects, permissions, financial records, and subscription.

## Product and interface

Use a responsive, keyboard-accessible web interface with light and dark themes. Give executives an organization-wide view of project health, workload, deadlines, approvals, and financial metrics where permitted. Give Development, Social Media, Content, and Operations their own entry points into shared projects, tasks, calendars, files, collaboration, and reporting. Derive metrics from actual records. Label sample workspaces and distinguish unavailable metrics from zeroes.

Build on the React and TypeScript application in this checkout. Evaluate Tailwind CSS and shadcn/ui as shared design primitives when adding authenticated workflows. Use Supabase Auth, PostgreSQL, row-level security, and Realtime for the production data layer. Use Vercel for the web deployment, Cloudflare R2 for private assets, and Capacitor for native apps after the web and PWA workflows are stable.

## Data and security

Use versioned migrations and a synthetic seed. Model organizations, memberships, roles and capabilities, departments, and department memberships before projects and tasks. Add project memberships, client access grants, milestones, tasks, task assignees, comments, attachments, work logs, notifications, and audit events as their workflows are implemented. Give tenant-scoped records an organization ID and enforce compatible tenant scope on relations with composite foreign keys. Index organization IDs, access grants, foreign keys, task statuses, and due dates used in dashboards.

Use membership-based RLS for reads and writes, with both row selection and write checks. Define capabilities for founder/admin, operations manager, product manager, project manager, developer, QA engineer, social media manager, graphic designer, video editor, content writer, finance manager, and client. Department and project roles use explicit scope. Clients see only their granted projects and explicitly client-visible content. Store internal discussion, payroll, profitability, credentials, and other privileged data in separately protected records. Prevent clients from assigning their own capabilities or moving rows between tenants. Keep service-role credentials server-side, use short-lived signed URLs for private objects, and ensure Realtime subscriptions obey the same visibility rules.

Provision the first administrator and organization in an authorized transaction. Use expiring invitations and audit membership changes, access grants, status transitions, approvals, and financial mutations. Derive actor and timestamp from trusted context. Protect audit rows from direct user edits and omit sensitive payloads from logs. Test policies through actual authenticated clients for two unrelated tenants, staff with narrow scopes, a client, and an anonymous caller.

## Delivery sequence

1. **Core infrastructure.** Replace the demo persistence adapter for authenticated sessions. Implement organization creation, invitations, department and project membership, task assignment and status changes, in-app notifications, agenda views, and scoped executive metrics. Accept this phase once users can sign in, collaborate on shared data, reload into a working session, and pass the tenant isolation tests.
2. **Development.** Add products and roadmaps for TeachEasy, Asele, FarmStead, Reframe, and 1Vet. Support sprint planning, bug triage, feature requests, documentation, QA and acceptance criteria, incidents, time tracking, releases, and deployments. Connect GitHub via a scoped GitHub App. Verify signatures and deduplicate webhook events.
3. **Marketing and creative.** Add brands, guidelines, campaigns, post drafts, creative briefs, asset versions, production assignments, internal review, client decisions, scheduling, publishing, analytics, and monthly reports. Keep changes to approved content subject to renewed review. Integrate publishing and analytics only after confirming provider scopes and approval requirements. Support explicit scheduling time zones and idempotent publishing jobs.
4. **Client and business.** Expose branded client access for progress, requests, issues, approvals, calendar, messaging, deliverables, and invoices. Add leads, pipeline, proposals, contracts, invoices, payments, retainers, expenses, payroll, and profitability reports. Store money in integer minor units with an explicit currency. Restrict finance views by capability and keep transitions and adjustments auditable.
5. **AI and automation.** Use server-side OpenRouter requests to draft plans, captions, acceptance criteria, summaries, and reports from data the caller can access. Require explicit confirmation for consequential changes. Record job outcomes and support controlled retries. Use Resend for transactional notifications and isolate tenant credentials and delivery state.
6. **Mobile and commercialization.** Validate a PWA installation and update flow before adding native Capacitor builds. Add subscription entitlements, tenant onboarding, billing, data export, and operational monitoring. Verify accessibility, tenant separation, and lifecycle operations before opening self-service signup.

## Verification

For each phase, run the type check, production build, relevant migration and policy tests, and a browser flow through the new feature. Exercise denied actions as well as permitted actions, including guessed IDs, unauthorized downloads, and tenant switching. Use sandbox accounts for provider integration tests and document required configuration by name without committing values.
