# Pinata public IPFS uploads — deployment runbook

## Scope
Mint Page Studio now supports JPG, PNG and WebP uploads from authenticated collection owners/admins to public IPFS. Recommended <=2 MiB; hard cap 3 MiB. The server validates actual image signatures, checks the active SIWE session, CSRF token, matching chain, and current on-chain owner/admin role before transmitting bytes to Pinata. It uses the Pinata public network and returns an `ipfs://<CID>` URL, which is placed into the existing draft Artwork or Banner field. **Save revision** remains necessary after upload.

## Configure securely
- In Pinata, create a JWT with public-file upload permission only if Pinata's key scopes allow this.
- Vercel → transient-contract-manager-preview → Settings → Environment Variables → `PINATA_JWT` (Sensitive/Secret), Production only. Paste the JWT there; never in GitHub or chat. Redeploy Production after saving.
- No `NEXT_PUBLIC_PINATA_...` variable, no changes to Supabase schema or mainnet-write flags.
- Provider's available upload sizes and public-IPFS plan limits remain subject to your account.

## Acceptance
1. Connect owner/admin wallet and open the saved GO1 mint page draft.
2. Choose a <=2 MiB JPG/PNG/WebP via Artwork upload; wait for CID confirmation.
3. Verify field automatically becomes `ipfs://bafy...`; click Save revision and reopen draft.
4. Repeat for Banner. Confirm both images render via the existing same-origin media endpoint and the mobile preview.
5. Negative cases: unauthenticated/unauthorized user, too-large image, SVG, fake MIME and cross-origin request must be rejected.
6. Confirm no blockchain transaction was requested; `MAINNET_WRITES_ENABLED=false` remains in place.

**Important:** Uploaded images are public content-addressed IPFS data. Publishing a CID to IPFS is not reversible; do not upload secrets or private artwork. Upload is not automatically unpinned if the draft is abandoned.

## Palette
Prof. NOTA screenshot-derived monochrome palette is documented separately in `docs/PROF_NOTA_MEDIA_AND_PALETTE.md` (PR #3). Do not alter the current UI theme in this upload PR.
