# Deployment runbook

Target: Next.js on Vercel, Supabase PostgreSQL, eventual custom domain `transient.endhonesa.com`. No deployment, DNS change, project creation or production migration has been executed.

## Current stage and verified infrastructure

The repository is private: `myreceiptt/transient-contract-manager` (ID `1428431731`). The original source commit `c2974ab556a3c233f43b0a4d21d85fd551ea9fa6` has been restored. Normal CI is read-only and has no deployment job.

Vercel team `prof-nota` (`team_DlAJnjQegWeVLHocsTBVq1Kw`) read access is now independently verified by the user. The earlier 403 is resolved. Write permissions remain untested; no project creation, deployment or DNS operation is authorized in the source-restoration stage.

The user has already created the isolated Free-plan Supabase project `transient-contract-manager-preview`, ID **`ztiegrqflrpoksuocrze`**, in organization `kmvzxndegliuwirjzskb`, region `ap-northeast-2`. Read-only inspection found ACTIVE_HEALTHY / PostgreSQL 17.11, zero public tables and zero migrations. Other databases are out of scope.

## Supabase migration approval gate

Follow [the exact migration plan](MIGRATION_PLAN.md), including the SQL fingerprint, project identity, CLI history-version requirement, verification queries and recovery rules. **Do not apply the migration until the user approves that plan.** Project creation is already complete and must not be repeated.

The service key is used only by the server RPC client. Supabase Auth is not the wallet session authority; the application verifies SIWE itself and stores opaque session hashes. Enter credentials only through secure server secret settings during a separately authorized preview stage. Never commit, print or expose them through NEXT_PUBLIC variables. Production must use a separate approved database.

Mainnet writes remain **false**. The production domain is not attached. See [the security review](SECURITY_REVIEW.md) for hosted acceptance blockers and granular network/action release controls.

The following deployment instructions describe later stages; they are not authorization to execute them now.

## Vercel preview

Use the installed Vercel connection after it has the proper team grant. An optional CLI flow, after the operator authenticates securely and checks the same team/project, is:

```bash
vercel link --project transient-contract-manager --scope prof-nota
vercel env ls preview --scope prof-nota
vercel deploy --scope prof-nota
```

These are operator instructions, not commands already executed. Inspect the resulting deployment ID, URL, build logs and ready state. The repository's `vercel.json` fixes the framework/build/install commands and bounds API/media function durations. The project should use Node 24.x (tested) or a separately verified Node 22.x setup.

Configure the following using the Vercel environment UI. Supabase credentials must be Secret type, scoped to the correct environment. Public variables are Config type. Never pull production secrets into an untrusted checkout.

| Variable                                                                 | Scope / value                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `APP_ORIGIN`                                                             | Server Config; exact HTTPS preview origin; later exact production origin |
| `NEXT_PUBLIC_APP_ORIGIN`                                                 | Public Config; same origin                                               |
| `SUPABASE_URL`                                                           | Server Config; new application project URL                               |
| `SUPABASE_SERVICE_ROLE_KEY`                                              | Server Secret; input directly by operator                                |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`                                   | Public Config; optional WalletConnect project with allowed origin        |
| `ETHEREUM_RPC_URL`, `ROBINHOOD_RPC_URL`, `BASE_RPC_URL`, `SHAPE_RPC_URL` | Server values; Secret if URL embeds credentials                          |
| `MAINNET_WRITES_ENABLED`                                                 | `false` throughout initial preview review                                |
| `LOCAL_CHAIN_ENABLED`, `NEXT_PUBLIC_LOCAL_CHAIN_ENABLED`                 | `false` on Vercel                                                        |
| `MEDIA_ALLOWED_HOSTS`                                                    | Optional approved HTTPS image/metadata hostnames; no schemes or paths    |

The exact origin is important for SIWE and CSRF. Prefer a stable preview alias; update both origin settings and redeploy after assigning it. Do not allow any arbitrary incoming Host header to become an authentication domain. The development PGlite fallback is forbidden when NODE_ENV=production.

## CI and Git

The included Git bundle has been verified and imported to the private repository. `.github/workflows/verify.yml` runs dependency installation, typecheck, unit tests, runtime reproduction, local integration, migration permissions/recovery checks, dependency audit and production build. Logs are uploaded as a commit-specific CI artifact, including failed-run evidence. It has read-only repository permissions and no production deployment step.

Protect the release branch with required checks. Connecting the Git repository to Vercel can create deployments on pushes; configure preview behavior and production approval controls before enabling the connection. Production release is a separate approval gate.

## Preview acceptance

- Ready deployment and no failed build/runtime logs.
- HTTPS, expected origin and security headers.
- GO1 reads accurate owner/admin/token/royalty data at a stated block.
- Browser wallet connect, chain switch, SIWE sign-in and sign-out.
- Owner/admin shared draft access, concurrent-version conflict, revoked-admin denial.
- Desktop/mobile editor and collector page rendering.
- Hosted database persistence after a deployment restart.
- Metadata/IPFS artwork rendering and safe failure behavior.
- All four RPCs return the expected chain/runtime and support finalized reads.
- Keep the mainnet gate off. Use a separate controlled test environment for wallet transaction acceptance.

## DNS and production, after explicit approval

1. Add `transient.endhonesa.com` to the verified Vercel project only after the user approves the domain change.
2. Read the exact DNS record and any ownership-verification record returned by Vercel. Do not assume a generic CNAME target or replace existing records without inspecting them.
3. Apply the specific approved subdomain records at the actual authoritative DNS provider; leave apex/mail/other app records unchanged.
4. Wait for Vercel domain verification and HTTPS certificate readiness.
5. Set `APP_ORIGIN` and `NEXT_PUBLIC_APP_ORIGIN` to `https://transient.endhonesa.com`, and update WalletConnect allowed origins. Redeploy a staged production build.
6. Verify health, SIWE domain/nonce/secure cookies, draft persistence and mainnet write lock over HTTPS. Promote only the tested production build after approval.
7. A write-enabled release requires separate per-network acceptance and user approval; domain attachment does not authorize blockchain transactions.

## Recovery

Do not delete existing infrastructure to "make room". On build failure, inspect logs and fix the source/environment. On migration failure, inspect the transaction and schema before retrying. On a pending blockchain transaction, use its stored hash and nonce; never resend automatically. Database restoration and production rollback should be rehearsed on the isolated preview project first.
