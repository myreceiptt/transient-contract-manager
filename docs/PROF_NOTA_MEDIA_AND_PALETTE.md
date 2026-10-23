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
Reference: three user-provided screenshots, captured 2026-10-23 (landing page, 0101 Collection, and Track Us). The HTML headings/navigation include `Prof. NOTA`, `0101 Universe`, `{ prof. } { 0101 } { cont. }`, and `{ prog. } { proj. } { logs }`.

### Sampled screenshot colors (measured from PNG pixels)

| Design role | Screenshot HEX | Meaning |
| --- | --- | --- |
| Void | `#000000` | Deepest landing-page background |
| Background | `#101011` | Section/page dark ground |
| Surface | `#161618` | Subtle raised panels |
| Border | `#27272A` | Thin cards/dividers |
| Muted | `#71717B` | Tertiary text |
| Secondary text | `#9F9FA9` | Captions/labels |
| Primary text | `#F4F4F5` | Light on dark |
| High contrast | `#FFFFFF` | Hero/maximum contrast |

These are **reference samples**, not independently verified computed CSS variables. Exact CSS sources may differ because of compression, antialiasing and background gradients. The website uses a predominantly monochrome palette with intentionally quiet contrast, generous spacing, thin borders and understated navigation.

Proposed CSS token map for a later phase:
```css
:root[data-theme='prof-nota'] {
  --nota-void: #000000;
  --nota-background: #101011;
  --nota-surface: #161618;
  --nota-border: #27272A;
  --nota-muted: #71717B;
  --nota-secondary: #9F9FA9;
  --nota-text: #F4F4F5;
  --nota-high-contrast: #FFFFFF;
}
```
**Do not apply this theme yet.** Preserve current Transient Contract Manager visual UI until media uploads and collection-management features have stabilized; then create a separate design PR with accessibility/contrast checks.

## Current environment
`MEDIA_ALLOWED_HOSTS` was cleared in Vercel Production/Preview on 2026-10-23 to remove the explicit `nota.endhonesa.com` exception as requested. A new deployment must occur for this value to take effect.
