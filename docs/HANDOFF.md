# MoT hosting handoff

Use Firebase/GCP project `nonhumanintelligence`, the existing Hosting site `ministryoftourism`, and target `mot`. The site's production URL is https://ministryoftourism.web.app. `.firebaserc` commits this mapping; `firebase.json` selects only `mot` and serves `apps/web/dist`.

Verify with `node scripts/test-mot-hosting.cjs`, `firebase use`, `firebase target --project nonhumanintelligence`, and `firebase hosting:sites:list --project nonhumanintelligence`. On 29 October 2026 the CLI account was the project's owner, and the existing site was confirmed. Do not create a replacement site or use `uncommoncore` for MoT. A legacy Writer's Board mapping may remain in a private checkout under `uncommoncore`; leave it unchanged and always specify the project and MoT target.

The preview command, after owner approval, is `firebase hosting:channel:deploy mot-spark-check --only mot --project nonhumanintelligence --expires 1d`. It builds the candidate through the existing predeploy hook and targets only this site's preview channel. A production release uses `firebase deploy --only hosting:mot --project nonhumanintelligence` after its separate release gate. Never issue an unscoped deploy, initialize Hosting again, or deploy the FCC or Writer's Board sites from this checkout.

No site was created and no deployment was run by this configuration change. Preview/production acceptance requires actual release receipts and real-origin checks; local target resolution is not a deployment pass.
