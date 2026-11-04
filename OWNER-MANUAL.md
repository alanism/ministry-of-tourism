# Owner's manual: bring the trip, make it yours

Ministry of Tourism gives your plans and memories one place to live. Start with a destination, a booking, a free afternoon or a trip that has already ended. Add only what is useful now. You can work by hand or ask Muse to help, then take away a magazine and an editable copy.

This manual describes the browser-and-files workflow inspected on 4 November 2026. It also identifies optional or future services where they affect a choice. Source and hosted versions can differ; use the controls actually available in your browser.

## Start where you are

| Your starting point | First useful action |
| --- | --- |
| No destination yet | Ask Muse to compare a few possibilities; choose a city before creating its board |
| Destination, no bookings | Create the city board and add tentative ideas |
| Existing bookings | Add the supplied facts, then plan around them |
| Already traveling | See Today, add a photo or change one affected activity |
| Home again | Add memories and go straight to Keepsakes |
| Someone sent a trip | Use Import ZIP to open an independent editable board |

Open [MoT](https://ministryoftourism.web.app/?view=trip). A returning browser can reopen its saved board. A new visitor chooses a destination for an empty board. Manual planning does not require a model key or a MoT sign-up. The browser profile matters: Muse's cloud browser and your own laptop browser have separate storage.

## Build a board you can understand

Add places, flights, stays, photos and notes as needed. Begin with a few important cards. Put a card's plan in that card's Notes field, and identify the relevant card when writing a separate note. Use Board and its available views to arrange ideas, then Today when you want to see the next saved activity.

Treat confirmed and tentative details differently. Use real booking facts you supplied. Label an unbooked hotel or activity as an idea. A suggestion does not establish an opening hour, ticket price, travel time or reservation. Check the original source when the trip depends on a current detail.

Small changes can stay small. Rename a card, move it, add a photo or edit a note without starting a new plan or vote. Use available Undo controls when needed. Undo behavior depends on the action and session; keep a backup before a substantial change rather than relying on an unlimited history.

Watch the saved state. **Saved on this device** means the browser has confirmed the board write; it does not mean another device has it. **Saving…** means wait. **In this tab only** or an image-storage warning means download an appropriate ZIP backup before closing. Reload and inspect important details when checking that work survived.

## Ask Muse for a specific piece of help

Tell Muse what you want, what is fixed and what it may change. For example:

> Open Ministry of Tourism and read its current trip guide. Use my existing board. Suggest two options for the free afternoon, keeping the supplied hotel and departure unchanged. Mark missing hours and travel times as unknown. Save and read back the result. Report any blocked step.

Use this only in the environment containing the intended board, or deliberately provide an imported copy. A browser agent can operate the visible interface. If its environment permits it, the in-page `window.motTrip` contract also exposes supported operations. Agents should inspect current capabilities and board identity before editing.

The in-app model adapter is a separate optional connection. If it says unavailable, manual work and browser-agent or file workflows can still be useful. The public Muse helper reads public FCC catalogue metadata and source links. It cannot see private boards, edit the trip or establish current venue facts. A website visit does not register a native connector automatically.

### Use your own Muse with files

1. Open **Use your own Muse with files** from the board menu or Ask Muse path.
2. Choose non-private cards and, if useful, public FCC image references. Read the exact context and request before downloading.
3. Deliberately upload the context ZIP to your assistant conversation. The ZIP contains the guide and proposal schema. The context excludes image bytes, private cards, credentials and whole-document history; shared text can still contain anything you wrote into it.
4. Ask the assistant to return a proposal file matching that schema. Download it and import it into the original board in the same browser profile.
5. Inspect the before-and-after differences, choose the changes you want and use **Apply selected changes**. Confirm saving afterward.

The assistant does not apply the file remotely. Wrong-board, stale, expired or altered proposals require inspection and usually a fresh context request. If a save is uncertain, follow recovery rather than pressing Apply again to repeat the operations. Cross-reload continuation and Undo have limits. If the client cannot handle ZIP, the panel offers context JSON and separately downloadable guide/schema files.

## Bring family and friends into a decision

Use **Group preferences** when several options need a group response. A person declares and opens the round. Each household ranks favorites and can use Approved, Maybe and Denied independently. Collect the reply files and resolve household sender labels deliberately.

Read the result as **points** or **instant-runoff**, with concerns and missing replies visible. These methods count ranked replies differently. Closing a round preserves an advisory result; it does not book an activity or apply a plan. Changing important trip facts means checking what changed and, when necessary, opening a fresh round.

For broader contributions, send an editable ZIP with a specific request. Each person and their agent works in a separate copy. A returned package imports as a new board; ordinary package exchange is not automatic live synchronization or a general conflict-free merge. Compare versions and keep the original until you have reviewed the return.

## Make a host or local guide

Mark reusable local recommendations as **Guide** cards. Create a guest copy by selecting the Guide cards to include; the master remains unchanged. Add the details appropriate to that particular stay afterward.

Read the selection before exporting. **Guide only** omits shared stay material. A Public trip copy can include guide and stay content. A Review copy includes private content as well. A guest file creates an independent copy, rather than membership in a live service. Production shared rooms and live synchronization remain unavailable in the inspected guide; development-test controls are a separate path.

## Add a sense of place and keep memories

Use **Explore FCC** or the artwork browser to find city stories, artwork and stickers. Inspect source, credit and permitted use before adding material. Keep the original location clear, including when artwork is decorative rather than a recommendation for the trip's city. Network or source failures should remain visible.

Use **Composition** to arrange images and artwork. In **Keepsakes**, choose memories, preview the magazine or make a photo postcard. Select a photo, choose Postcard or Memory page and write its caption. The PNG is a derivative; it does not replace your original photograph. A low-resolution warning means the photo may suit a digital keepsake better than a sharp print.

Read the pages before export. Check dates, names, crops, missing pictures, long captions and anything too personal for the recipient. You can make a new issue during the trip or after it ends. You do not need to rerun planning to keep a memory.

### Discovery and photo illustrations: local previews

Three additional workflows are implemented locally and are not yet deployed. Their controls may therefore be absent from the public app. Approved reference-image integration for the illustration treatments and a secured public funded discovery backend remain in progress.

**Discover more places** starts from one to three public FCC places and a category. Review its disclosure, then inspect the source excerpt supporting each returned suggestion. Instagram labels require qualifying readable public-post or reel evidence, rather than a profile URL or a model's unsupported link. Private Instagram access is not provided. Search evidence does not verify current venue facts, and no eligible result is a valid outcome. You choose whether to add an unverified card with its evidence. [Read the use case](usecases/discover-more-places.md).

**City Ink** turns a chosen street or architecture photo into an opaque illustration. **Fashion Illustration** applies an editorial treatment to a personal photo. Selecting a photo prepares a preview without uploading it. An explicit generation request sends the prepared copy under the provider's terms and can incur a charge; the current local implementation uses the person's own session key. The original file is unchanged. Review the result, then download, discard or save it as a private illustration card. Personal preview inclusion and Review export remain separate choices. Neither treatment produces a transparent cutout, and fixture/browser checks do not establish final live reference fidelity. [City Ink](usecases/city-ink-architecture.md) · [Fashion Illustration](usecases/photo-fashion-illustration.md).

## Choose the right copy and format

Select the audience before the file type:

| Copy choice | Included material | Appropriate use |
| --- | --- | --- |
| Public copy: Trip | Shared guide and stay cards and permitted media | A companion who needs shared trip information |
| Public copy: Guide only | Shared guide material | A reusable local guide |
| Review copy | Includes private notes, votes and images | Owner backup or a trusted full reviewer |

Public copy is a filter, rather than automatic internet publication. Review copy deserves a contents check before sending. No choice can recall a file already downloaded by someone else.

| Format | What it is for | What to keep in mind |
| --- | --- | --- |
| HTML magazine | Standalone browser reading, including offline after download | A reading snapshot; use ZIP for continued board editing |
| PDF magazine | A light screen-oriented file to attach or message | Digital pages, rather than a print fulfillment service |
| Editable `.mot.zip` | Reopen board, layout, notes and permitted media in MoT | Import ZIP uses the actual media in the package |
| Keepsake PNG | A photo postcard or memory page | Check preview and resolution |

Wait for **Ready**, then download. The receipt identifies the board revision, file and bytes. **Kept in this browser** is separate from having a download in your own storage. Open the downloaded reading copy, or import a test ZIP and inspect the cards and photos. New board changes require a new export; old files do not update themselves.

## Recover without losing the source

| Problem | Next useful step |
| --- | --- |
| A board is missing on another device | Use the original browser profile or import your exported ZIP |
| A photo is missing | Restore a ZIP containing its bytes or choose another photo |
| Storage says work is in this tab only | Download a ZIP before closing; inspect recovery choices |
| Export stops or is cancelled | Keep the board, read the message and retry when ready; do not call a partial file finished |
| A proposal is stale or expired | Issue fresh selected context after reviewing current changes |
| Muse helper cannot connect | Report the client's missing capability and use browser/files where supported |
| A returned group copy differs | Keep both versions and review them; do not assume automatic merging |

Keep your backups somewhere you control, outside the browser as well as inside it. Share diagnostics deliberately and avoid attaching private trip material to a public issue.

City-art shopping can help you save souvenir ideas and visit FCC's collection. It does not establish an order, stock, a price or payment. In-app T-shirt checkout and printed photo-book fulfillment are future directions. The useful result today is a trip you can shape, a file you can keep and a decision you still control.

[Documentation index](INDEX.md) · [Implementation boundaries](IMPLEMENTATION-NOTES.md)
