# Content, assets and attribution

## Code license and separate assets

MoT-owned source code is free to use under the [MIT license](../LICENSE), including commercial use. This includes the owner's Enochian component code copy in MoT, explicitly authorized on 28 October 2026. Attribution and the earlier upstream license history are retained.

IBM Plex, other Fontsource fonts, third-party dependencies, FCC content and trademarks retain their own terms. They are not automatically covered by MIT. Preserve the notices in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and the vendored files.

## FCC and independent providers

[Foreign Clubbers Correspondence (FCC)](https://foreignclubberscorespondence.web.app/) is the first and natural content provider. The current adapters are FCC-specific; broader provider extensibility is planned. FCC is not a required aesthetic, audience or editorial viewpoint.

Independent providers, magazines and FCC-style shops using **their own content** are welcome, including different audiences and commercial businesses. There is no noncompetition condition. This freedom does not override separately licensed software components or the rights in FCC-supplied materials.

FCC's supplied materials may be used for their intended MoT purposes: trip planning, host and guest guides, personal journals, boards and keepsakes. Personal use of FCC artwork is allowed within that scope, with the supplied attribution and asset-specific terms. Sharing a host guide or guest copy is an intended use; unrestricted bulk rehosting or sublicensing is not granted.

You may refer customers to FCC's merchandise and checkout. This promises no commission, reseller status or right to manufacture merchandise. Separate permission is required to repackage FCC materials as commercial standalone assets or sticker packs, resell FCC artwork or downloads on other marketplaces, or manufacture and sell third-party merchandise using FCC art.

These content conditions apply to **FCC-supplied materials**, not MoT source code or independent content. FCC's separate source code, articles, maps, stickers, product photos, artwork, fonts and trademarks are not automatically licensed by this repository's MIT file. Follow per-asset rights and attribution; permissions cover only rights the provider controls. No blanket exclusive-copyright claim is made over AI-generated images. Ask FCC for permission for uses beyond the intended scope.

## Assets and provenance

The public source includes catalogue metadata pointing to FCC's public HTTPS endpoints. It does not mirror FCC's artwork binaries. Original bytes are fetched when a person uses the app and may be kept in their own trip package according to the content terms above.

Restricted local sample JPGs, personal trip files, internal planning/account documents, deployment bindings, build outputs and local history are excluded from this public checkpoint. The default landing and sample trip work with labeled notes and no sample-photo requests. To install your own appropriately licensed sample media, supply `river.jpg`, `street-art.jpg`, `doorway.jpg` and `room.jpg` under `apps/web/public/sample/`, then explicitly set `VITE_MOT_SAMPLE_MEDIA=enabled` at dev/build time. Do not enable that setting with uncleared assets.

MoT reuses the board engine from [Writer's Board](https://github.com/alanism/ucc-writers-board-notebook). The public checkpoint preserves relevant component attribution while keeping FCC's repository and internal project material separate. The app name does not imply government, Airbnb or Meta endorsement.
