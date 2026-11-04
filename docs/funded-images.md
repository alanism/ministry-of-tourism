# Hackathon funded photo illustrations

## Live release record (supersedes the staging status below)

Deployed on 4 November 2026 to https://ministryoftourism.web.app/ with explicit owner deployment approval. Image function is ACTIVE, Node22 revision `motfundedimages-00001-nez`; Hosting version `d262ea4c68ee08dd`. Live entry `/assets/index-BXCT7UBv.js` has SHA256 `ff401535eb41d79fd02da17963193064bfbec99945990caea0400bbef6bf32c2`, matching the frozen tested artifact. Direct and hosted status return200/availabletrue; direct CORS preflight204 and missing-authPOST401 passed. No paid image/judge call was made by this workstream; configured readiness is not a verified Meta generation result.

Active allowance is two lifetime attempts per guest identity,20per UTCday,100total,one concurrent request,ending `2026-11-18T23:59:59.000Z`. No hard total dollar cap is claimed. Specific two-image paid smoke approval (US$0.02 image charges,no judge/retry) remains pending.

The initial gcloudEditor grant failed403; the existing FirebaseCLI project-owner session subsequently completed the specifically approved SecretAccessor grant on the named secret without reading its payload or creating credentials. Three other persistent image-runtime bindings were also applied: named-database-conditioned DatastoreUser,the existing AuthLookup role containing only firebaseauth.users.get,and AppCheckTokenVerifier. The parent clarified that these material access expansions required separate action-time approval. This was reported candidly; no further IAM change or undo will occur without direction. No default-database access or client rule change was granted.

The combined deploy stopped after successful function creation because an ArtifactRegistry cleanup policy was absent. A Hosting-only deploy completed the release; no cleanup policy was added or changed. Detailed receipt: `C:/Users/alani/Documents/Codex/2026-11-04/task-7/funded-image-launch-receipt.json`.

## Historical staging/checklist checkpoint

The following records the earlier staging state and proposed setup. The live release record above supersedes statements about disabled/undeployed status or pending secret setup. Code contracts,privacy protections and failure policy below remain applicable.

Local implementation only; no image function has been deployed or enabled by this change. The previously deployed public discovery service remains separate and unchanged. Fashion Illustration and City Ink have an optional owner-funded single-image path plus the existing BYOK path. "Free" describes the visitor allowance; Meta and Google Cloud still bill the owner. Optional rubric judging/retries remain BYOK-only.

## Contract and data flow

- `GET /api/muse/images/status` is a configured-readiness hint only, with no database reads or promise of remaining credits. It reports `transport: firebase-attested-image`, `readiness: configured-only`, fixed limits and, when enabled, the campaign expiry.
- `POST /api/muse/images/edit` accepts exactly `{requestId, style, photoBase64, consent:true}`. The UUID is fresh; style is `fashion` or `city`; source is a canonical base64 JPEG prepared by the browser. It rejects keys, filenames, prompts, references, arbitrary URLs, model choices, board data and extra fields.
- Success is `{status:'ok',data:[{b64_json}],output_format:'png',model:'muse-image-1.0',createdAt,elapsedMs,width,height}`. Errors contain only bounded `{status,code,reason}`, never provider error text or private inputs.
- Generation posts directly to `https://us-central1-nonhumanintelligence.cloudfunctions.net/motFundedImages/api/muse/images/edit`. This documented Gen2 alias must be verified after approved deployment. Hosting has a 60-second proxy timeout, so only the short status request uses a Hosting rewrite. There is no image POST proxy rewrite.

The request has exact production-origin CORS, omitted cookies, a revoked-token-checked anonymous Firebase ID token, fresh limited-use App Check, and `x-mot-request: 1`. Strict body/schema/size checks run first. App Check consumption and expected-app/jti validation gate Auth lookup; an existing durable signed-jti marker also gates Auth lookup, including when provider token-consumption reporting lags. Admission atomically marks the signed fingerprint using the collection shared with discovery, preventing cross-route/cross-instance token replay. Request UUID replay remains separately checked.

The browser's explicit consent must say that the prepared photo is sent through MoT's server to Meta. The existing BYOK claim that no MoT server receives the photo applies only to BYOK. The source photo is not read from board/private cards automatically. The server decodes the chosen JPEG, bounds it to 4 MiB and a 1,600-pixel longest side, and re-encodes it without source metadata before forwarding. It attaches the exact byte-pinned approved style reference and fixed approved prompt itself; callers cannot choose those. No originals, photos, output bytes, prompts, tokens or keys are written to Firestore, logs or Cloud Storage. Images are transient in request memory and returned with `Cache-Control: no-store`. This is not a promise about Meta's own retention.

The fixed provider call is one `muse-image-1.0` edit, `n:1`, no image search, web search or shell. The two approved references are copied unchanged into the function package and hash-checked before forwarding. Result JSON is bounded to 24 MiB; decoded PNG to 16 MiB/16 megapixels. Server decoding verifies actual pixels and re-encodes to an opaque metadata-free PNG. City Ink's exact MoT mark is still added locally before review, private save and export. No output is added automatically. No photo or image is sent to the Contributor discovery service; no funded judge call is implemented.

## Durable allowance and failure policy

The existing server-only named database `mot-discovery-usage` holds new `motImageControl`, `motImageDays`, `motImageActors` and `motImageRequests` collections. Discovery counters are untouched. Actor identifiers are salted HMACs; request records hold only hashes/nonces/state/timestamps. No raw UID or image content is stored. Existing deny-all client rules already cover these collections; the new runtime still needs separately approved database IAM.

Conservative code limits proposed for owner review are **two attempts per persistent guest identity for the campaign**, **20 attempts per UTC day**, **100 attempts total**, and **one concurrent admitted image request**. Clearing browser storage can create a new identity, so these are not per-person guarantees; shared global limits remain durable. An attempt is reserved transactionally before source decoding or any provider call, survives restarts and is never refunded. Invalid image bytes can consume an admitted attempt. Completion is nonce-bound and idempotent.

A request sends at most one image call, with no retries or funded quality loop. The 240-second provider deadline remains active after a caller disconnects once dispatch begins, allowing accounting before returning a cancelled/no-image result. The function timeout is 300 seconds; a lease is 330 seconds. Accounting is awaited outside the provider timer. Missing/unknown provider outcomes or expired crash leases halt further image admission for owner review, with no automatic reset/refund. A normal disconnect with a known result does not halt admission. No late result reaches a cancelled browser.

Meta's published price checked for this work was US$0.01 per generated image. The 100-attempt limit therefore corresponds to an estimated US$1 of image generation at that rate, assuming one billed image per fixed request. This is **not a hard dollar cap**; platform/Auth/App Check/database costs are separate and prices/account treatment may change. No claim is made about unverified Meta dashboard spending controls. Owner budget/expiry must be confirmed before enablement. Do not reset/delete the image counters, salt, request records or shared replay markers to restore allowance.

## Setup state and approvals

Target: project `nonhumanintelligence` (`944001311456`), region `us-central1`, Hosting site `ministryoftourism`. Existing secret metadata was verified read-only: `projects/944001311456/secrets/MOT_META_DISCOVERY_API_KEY/versions/1`, enabled. No payload was read or copied. Its name does not prove model permissions or private-photo/account terms; those remain to be verified by an authorized account owner and approved live test.

Under Alan's explicit image-secret-access approval, `mot-image-runtime@nonhumanintelligence.iam.gserviceaccount.com` was created. Granting it `roles/secretmanager.secretAccessor` on **only that secret** failed with Google Cloud HTTP403: active account `alanism@gmail.com` lacks `secretmanager.secrets.setIamPolicy`. The grant did not complete. Do not broaden the caller's role or copy a key as a workaround. An authorized Secret IAM administrator must apply the already approved binding. No other image IAM/cloud configuration or deployment was performed.

Before deployment/enablement, the owner must approve:

1. Complete that specific secret binding with an authorized principal; no new secret/payload import is required. Existing secret revocation would affect discovery too.
2. Give the new image runtime database access conditioned on `resource.name == 'projects/nonhumanintelligence/databases/mot-discovery-usage'`, minimal `firebaseauth.users.get` permission and App Check Token Verifier. Reuse the already configured public web app/App Check identity; do not replace Auth providers/domains or deploy rules to `(default)`.
3. Confirm the proposed 2/20/100 allowance and explicit UTC campaign end. Configure `MOT_IMAGE_WEB_APP_ID`, `MOT_IMAGE_PREVIEW_ENDS_AT`, and the separate `MOT_IMAGE_PRIVACY_ACKNOWLEDGED` only after reviewing private-photo handling/Meta terms. `MOT_IMAGE_PREVIEW_ENABLED` defaults false; missing/past expiry or missing configuration fails closed. No runtime parameter is set by this source change.
4. Approve a narrowly scoped deployment using `firebase.images.json` and only `functions:mot-images,hosting:mot`. This alternate config preserves current discovery routes and adds only image status routing. Do not redeploy discovery or database rules as part of this image release. Confirm the direct function alias and production-only CORS using nonpaid OPTIONS/status checks.
5. Approve a separate bounded paid live test, identifying the photo/reference, one request and budget. Model/account compatibility, live style fidelity and optional BYOK judge calibration cannot be established by mocks. No such test was run here.

The image function runs Node22 with 512 MiB, at most two instances and two HTTP requests per instance; the durable image lease enforces the lower single-provider concurrency. It binds only the existing secret, uses no persistent credential file and emits no request/body logs. HTTP/Auth/App Check requests can still cost money outside the image allowance. Public status has no database-read amplification path.

## Verification

Backend dependencies are separately locked; build with `npm --prefix backend/images ci`, `npm --prefix backend/images run typecheck`, `npm --prefix backend/images run build`. Local code targets Node22; a deployed Node22/native-Sharp smoke test remains pending deployment approval.

Root-discovered `packages/mot-server/src/funded-images.test.ts` uses two tiny synthetic rasters, fictional keys and intercepted Meta responses. Its default cases test strict transport/consent, no arbitrary-key/prompt proxy, exact references, metadata stripping, opacity, replay before Auth, bounds, no retries and after-disconnect accounting. Real ledger cases require explicit `MOT_IMAGE_QUOTA_EMULATOR_HOST=127.0.0.1:<port>` and only use project `demo-mot-images`; they reset only the loopback demo database. Tests cover independent callers/clients, durable guest/day/lifetime budgets, shared discovery/image jti markers, UUID/nonce/idempotency, unknown/crashed outcomes and denied client reads/writes. No test uses a real Meta key or a cloud database.

Current primary documentation: [Meta models](https://dev.meta.ai/docs/models), [Meta image generation](https://dev.meta.ai/docs/image-generation), [Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits), [Firebase Hosting timeout](https://firebase.google.com/docs/hosting/functions), [Gen2 deterministic URLs](https://docs.cloud.google.com/functions/docs/release-notes#September_07_2023).
