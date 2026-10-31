# Synthetic Muse cloud-agent probe

MOT-138 · prepared 1 November 2026 · **NOT EXECUTED**

This is a concrete task for the user's **Muse cloud agent**, not Muse Code or a
model API. It contains no real trip, account details or private media. The
context in `mcp-public-file-fixtures.json` is a synthetic example, not a request
issued by the MoT application; its returned proposal must not authorize Apply.
Creating a file in the cloud and delivering it are separate observations.

## File probe task

Give Muse the standalone synthetic context file and the proposed schema bundle,
then use this task:

> Work only with the synthetic context and contract I supplied. This is a file
> capability test, not a real holiday or permission to inspect my accounts,
> memories, unrelated files, connected services or private trips.
>
> In your own cloud workspace, read the context as JSON. Report whether it
> arrived as a real file or pasted text, and compute the SHA-256 of the received
> input bytes. Use its unchanged board, request ID, base revision, native token,
> context digest and maximum expiry to prepare one `mot.proposal` version1 file.
> Propose only a new note titled `Synthetic assistant file probe`, with body
> `This proposal is a fixture. It has not been applied.` and stage `plan`.
> Use a new proposal identity and status `proposed`; do not claim approval,
> persistence or that you read or changed any MoT trip.
>
> Save UTF-8 JSON as `synthetic-result.mot.proposal.json` in your cloud workspace
> and provide the actual downloadable artifact if your current interface
> supports that. Report its MIME type, byte count and SHA-256. If an action
> requires permission, request it normally. If delivery is unavailable, say so;
> a pasted code block or inaccessible path is a manual fallback, not a successful
> file download. Do not install software, create credentials, enable services or
> disable security controls for this test.
>
> Return a short receipt containing actual operations and outcomes. Include the
> cloud/runtime build and delivery interface only if observable; otherwise use
> `not exposed`. Do not return credentials, internal prompts, private identifiers
> or an archive of your computer. This fixture has no local MoT issuance record;
> stop after file delivery and do not attempt Apply.

## Public connector probe

For the MOT-138 general capability check, an existing **authorized read-only
reference MCP service** may be used instead of MoT. Identify that actual server,
capture its real cloud-agent exchange and label the result as reference/client
evidence only. No reference URL or permission is invented by this packet.

The public MoT endpoint is **not implemented or deployed** at this checkpoint.
There is no URL to give Muse yet. Do not fabricate one, expose a laptop server,
use a tunnel, or call a reference-service result a MoT integration pass.

After MOT-140 has an authorized test endpoint, ask the actual cloud agent to:

1. Use the documented approved/custom connector route available in that agent.
   Do not assume a desktop-style MCP configuration screen exists.
2. Read service capabilities; perform one bounded FCC search and selected item
   read; exercise pagination and a known unavailable item from the fixture set.
3. Return source/snapshot/eligibility evidence and a useful discovery result.
   No local trip access, context upload, account write, Apply or purchase.
4. Observe normal permission prompts/denials. No approval or connector
   registration is inferred from the presence of an HTTP URL.

The service operator must pair this with a sanitized server transcript of
actual protocol/transport/capabilities, response forms and cancellation. A model
description of what it would call is not a network observation. The runtime
matrix remains `NOT EXECUTED` until those receipts and delivered bytes exist.

## Local verification after a real return

Record the returned file bytes/hash, schema result, matching context identity
and a clear distinction between VM creation, artifact delivery and local import.
Use the proposed contract's duplicate-key/byte/expiry/native-reference checks;
the documentation checker is not an installed app importer. Human review,
Apply/Undo, persistence, offline reopen and real mobile handling remain
MOT-141/142 evidence. Preserve unsupported or denied outcomes.
