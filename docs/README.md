# Documentation

For using MoT, start with the [owner's manual](../OWNER-MANUAL.md) or the [use cases and product philosophy index](../INDEX.md). Individual use cases distinguish the current browser/file workflow from local previews and future directions.

For contributing, start with [development and the codebase map](DEVELOPMENT.md) for the current source tree, local commands and test suites. The repository contains three workspaces: the web app, shared core and optional server.

## Working on the app

| Topic | Reference |
| --- | --- |
| Setup, architecture and tests | [Development](DEVELOPMENT.md) |
| Contributions and releases | [Git workflow](GIT-WORKFLOW.md) |
| Board acceptance checks | [Checklist](CHECKLIST.md) |
| Browser agent contract | [Trip API](../apps/web/public/trip-agents.md) |
| Guidance source | [Trip guidance](../packages/core/src/trip/guidance.ts) |
| Optional Muse model connection | [Muse runtime](MUSE-RUNTIME.md) |
| Firebase site and target | [Hosting handoff](HANDOFF.md) |

## Product and integration references

| Topic | Reference |
| --- | --- |
| File exchange with an agent | [Public file contract](MCP-PUBLIC-FILE-CONTRACT.md) |
| FCC content and artwork | [FCC reuse](FCC-REUSE-GUIDE.md), [coverage audit](FCC-COVERAGE-AUDIT.md) |
| Standalone magazine | [HTML export](HTML-MAGAZINE-EXPORT.md), [memory limits](HTML-MAGAZINE-MEMORY.md) |
| Saved and downloadable exports | [Artifact lifecycle](ARTIFACT-LIFECYCLE-QA.md) |
| Group trips | [Planning](GROUP-PLANNING.md), [ballots](GROUP-BALLOTS.md), [routing](GROUP-ROUTING.md) |
| Shared rooms | [Room integration evidence](ROOM95-INTEGRATION-RESULT.md) |
| Content licensing | [Content and assets](CONTENT-AND-ASSETS.md) |

## Evidence and history

Task-numbered documents, QA reports and acceptance receipts describe the revisions and environments named inside them. They are evidence for those revisions, rather than proof about every later commit or the hosted build.

- [November 4 code review and cleanup](maintenance/2026-11-04-review.md)
- [October demo verification](history/2026-10-demo/VERIFICATION.md) and [closeout](history/2026-10-demo/DEMO-CLOSEOUT.md)
- [Implementation references](WP10-Implementation-References/README.md)
- [Recorded evidence](evidence/)

The two October demo reports retain their original test counts and observations. Use the development guide for current workspace names and commands.
