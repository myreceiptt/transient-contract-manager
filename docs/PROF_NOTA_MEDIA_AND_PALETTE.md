# Media upload and Prof. NOTA visual identity — implementation notes

Date: 2026-10-23
Status: Planning only — no code, theme changes, or pinning service credentials committed.

## Product direction
- Existing GO1 chain token metadata rendering works via `ipfs://` public gateways.
- Mint Page Studio should provide upload controls for **Artwork** and **Banner** in addition to optional manual `ipfs://` URL entry.
- Server must authenticate a SIWE session and revalidate owner/admin access on-chain for the target collection, not trust just the browser.
- Accept JPEG, PNG, WebP (no SVG, HTML, executable files). Recommended <=2 MiB per image; hard cap <=3 MiB to match current `/media` proxy size limit unless proxy and tests are deliberately extended.
- Verify actual file bytes/signatures, reject oversized request bodies before buffering where possible, bound concurrent uploads and rate-limit per session.
- Store images on **public IPFS**, never private IPFS for publicly displayed mint page artwork.
- A server-side pinning provider such as Pinata is one implementation option; API token lives only in the Vercel encrypted/sensitive Production environment. No direct client-side provider token. Provider/storage terms and costs require operator choice.
- Successful pin returns the provider-verifiable CID. Normalize it as `ipfs://<CID>`; populate the relevant form field and render via the existing validated `/media?url=` endpoint.
- Upload completion is distinct from saving a draft: preserve image CID once uploaded; save the draft through existing `page_save` revision route. Deleting an unsaved form must not silently unpin the image.
- Show progress, error/retry and CID confirmation; do not permit upload to trigger a blockchain transaction.
- No schema mutation, publishing or mainnet write in the first upload implementation.

## Prof. NOTA palette reference
Canonical website: https://nota.endhonesa.com/
Site identity observed in publicly fetchable HTML: `Prof. NOTA`, `0101 Universe`, top navigation `{ prof. } { 0101 } { cont. }`, section navigation `{ prog. } { proj. } { logs }`.

**Color palette measurement is pending:** The current web extraction returned content but did not expose computed CSS, stylesheet variables, or screenshot pixel samples. Do NOT invent exact HEX codes based on memory or generic aesthetics. Capture site CSS/computed style or a screenshot directly from the operator's browser before setting canonical CSS variables. The theme of Transient Contract Manager should not be changed until the features are complete and palette data is verified.

Required future tokens (exact values TBD after source capture):
- `--nota-background`
- `--nota-surface`
- `--nota-text`
- `--nota-muted`
- `--nota-accent`
- `--nota-border`
- `--nota-action`
- `--nota-action-text`

## Current environment
`MEDIA_ALLOWED_HOSTS` was cleared in Vercel Production/Preview on 2026-10-23 to remove the explicit `nota.endhonesa.com` exception as requested. A new deployment must occur for this value to take effect.
