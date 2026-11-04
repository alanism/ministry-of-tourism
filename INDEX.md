# Ministry of Tourism: ways to travel, reasons to build

Your trip can begin with a vague idea, a confirmed booking or a photograph from last year. These documents explain how MoT can help at each point and the principles that should guide its development. Start with the situation closest to yours; use the owner's manual when you want to do the task.

**[Open the owner's manual](OWNER-MANUAL.md)** for starting a board, using Muse, exchanging files, protecting private material and exporting a magazine. **[Read the implementation notes](IMPLEMENTATION-NOTES.md)** for source evidence and the boundary between current behavior and future direction.

## Use cases

Each use case includes more than 200 words of narrative, a user journey map and a Mermaid diagram.

| Your situation | Document |
| --- | --- |
| Traveling on your own | [Solo traveler](usecases/solo-traveler.md) |
| You have not chosen a destination | [Choose a destination](usecases/choose-a-destination.md) |
| You know the destination, with or without bookings | [Booked and unbooked planning](usecases/booked-and-unbooked-planning.md) |
| People want help from their own agents | [Collaborative multi-AI planning](usecases/collaborative-multi-ai-planner.md) |
| Family or friends need to choose together | [Household rankings and decisions](usecases/family-and-friends-voting.md) |
| You are welcoming guests | [Host and guest](usecases/host-and-guest.md) |
| You want to share local knowledge | [Local guide](usecases/local-guide.md) |
| You are already on the trip | [During the trip](usecases/during-the-trip.md) |
| You want to keep memories afterward | [Scrapbook and keepsakes](usecases/scrapbook-and-keepsakes.md) |
| You want the board to become an issue | [Travel magazine](usecases/travel-magazine.md) |
| You are looking for a meaningful gift | [City-art souvenirs and gifts](usecases/city-art-souvenirs-and-gifts.md) |
| You need to share some material and retain privacy | [Sharing with private notes](usecases/sharing-with-private-notes.md) |
| You want related places, with inspectable public sources | [Discover more places](usecases/discover-more-places.md) |
| You want architecture art from a street photo | [City Ink architecture illustrations](usecases/city-ink-architecture.md) |
| You want an editorial portrait from your own photo | [Fashion Illustration](usecases/photo-fashion-illustration.md) |

The four travel states are entry points, rather than a required sequence. You may start a keepsake during the trip or plan a free afternoon after most of the holiday is over. The three discovery and illustration use cases describe local implementations and work in progress; they do not announce deployed services. Read their maturity notes before expecting those controls in the public app.

## Philosophy

| Product commitment | Document |
| --- | --- |
| Keep the trip in the traveler's chosen workspace | [Your data, your workspace](philosophy/your-data-your-workspace.md) |
| Connect trusted publishers with provenance and rights | [Publisher-connected architecture](philosophy/publisher-connected-architecture.md) |
| Design for Muse and welcome other capable agents | [Muse first, open to agents](philosophy/muse-first-open-to-agents.md) |
| Make capable planning usable without a methodology lesson | [Project management for everyone](philosophy/project-management-for-everyone.md) |
| Offer good visual references before repeated generation | [Visual assets before generation](philosophy/visual-assets-before-generation.md) |

These essays distinguish the behavior found in the inspected source from the product direction. FCC is the first provider path. Other named publishers are prospective connections. “Web3-like” describes portability and independent sources; it does not claim an implemented blockchain or wallet.

## Where the carousel and local preview lead

| Carousel theme in the inspected source | Longer explanation |
| --- | --- |
| One trip board. Your own magazine. | [Solo traveler](usecases/solo-traveler.md) and [Travel magazine](usecases/travel-magazine.md) |
| Build a trip together. | [Collaborative multi-AI planning](usecases/collaborative-multi-ai-planner.md) |
| Use ranked-choice voting. | [Family and friends](usecases/family-and-friends-voting.md) |
| Make a scrapbook of your trip. | [Scrapbook and keepsakes](usecases/scrapbook-and-keepsakes.md) |
| Create your own travel magazine. | [Travel magazine](usecases/travel-magazine.md) |
| Find souvenirs. Choose gifts. | [City-art souvenirs and gifts](usecases/city-art-souvenirs-and-gifts.md) |
| Share your trip. Keep notes private. | [Sharing with private notes](usecases/sharing-with-private-notes.md) |
| Build your magazine as you travel. | [During the trip](usecases/during-the-trip.md) |
| Discover more like this (local preview). | [Discover more places](usecases/discover-more-places.md) |

Personal illustrations extend the same visual-keepsake idea: [City Ink](usecases/city-ink-architecture.md) for streets and architecture, and [Fashion Illustration](usecases/photo-fashion-illustration.md) for a person's photo. Both require review, preserve the original file and produce opaque output. Approved reference-image integration remains in progress.

