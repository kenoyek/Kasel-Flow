# Kasel OS

Kasel OS is an agency workspace for Kasel Digital Solutions. This first web build includes a demo executive dashboard, departmental views, editable projects and tasks, a due-date agenda, review notifications, search, and light and dark modes.

## Development workspace

Open **Development** and select a product. Use **New project** to create additional products. Product settings accepts an HTTPS GitHub repository URL and provides direct links to its pull requests and activity.

Use **Sprints** to define an iteration, then assign tasks to it in the task editor. The Tasks view groups work into the backlog and sprints. Roadmaps, bugs, feature requests, releases, QA, documentation, incidents, and time logs are scoped to the selected product. CI deployments and live GitHub synchronization require a backend integration.

## Marketing and creative workspace

Open **Social Media** or **Content** to set up a brand, write campaign objectives and creative briefs, compose posts, and track HTTPS asset links by version. Both departments share brand records. Attach a specific asset version to keep the reviewed deliverable stable as new versions are added.

Submit posts or briefs for internal review, then record the client's decision. Changes to reviewed content restart the review. The content calendar uses West Africa Time. Scheduling and publication are recorded manually, and the performance view summarizes manually entered post metrics by publication month. Shared file storage, client sign-in, and social platform APIs are pending.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Run `npm run build` to type-check the application and produce the production bundle in `dist/`.

The demo saves changes in this browser's local storage. Use it with sample data only. Sign-in, shared storage, and tenant permissions are pending. See [the master development brief](docs/master-development-brief.md) for the implementation roadmap.
