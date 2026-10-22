# Protected Vercel Preview — execution plan awaiting approval

This is a plan, not deployment authorization. No Vercel project or deployment has been created. Use only the exact security-remediation commit identified in the final stage report, after its complete GitHub verification run passes. Do not deploy a moving branch head or a dirty working tree.

## Fixed scope

| Item                      | Value                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- |
| Team                      | `prof-nota` / `team_DlAJnjQegWeVLHocsTBVq1Kw`                                         |
| Proposed new project name | `transient-contract-manager-preview`                                                  |
| Source                    | Private `myreceiptt/transient-contract-manager`, repository ID `1428431731`           |
| Environment               | Preview only; no Production deployment or promotion                                   |
| Framework / runtime       | Next.js; Node 24.x; repository root                                                   |
| Installation / build      | `npm ci` / `npm run build`; existing lockfile                                         |
| Database                  | Only `ztiegrqflrpoksuocrze` in organization `kmvzxndegliuwirjzskb`                    |
| Migration                 | Already applied: `20261021111911` / `core`; do not reapply or repair history          |
| Network writes            | `MAINNET_WRITES_ENABLED=false`; four supported networks hard-disabled in this release |
| Domain                    | Vercel-generated immutable HTTPS deployment URL only; no custom domain or DNS work    |

Read-only inspection on 22 October 2026 confirmed the team and found no matching TCM Vercel project. Recheck name availability immediately before creation; do not reuse or alter an unrelated project. Write permissions remain untested. Do not upgrade a service, add paid protection, or change resource capacity if a step is unavailable.

## Before the first deployment

1. Reconfirm the exact Git SHA and successful CI run from the stage report, private repository visibility, the team ID, and the already-applied database version. Stop on any unexpected source or database change. No database write is needed during provisioning.
2. Create only the named project using the project-creation API, with no initial deployment and no Git repository connection. Set `framework=nextjs`, root directory unset (repository root), `installCommand=npm ci`, `buildCommand=npm run build`, `publicSource=false`, `skipGitConnectDuringLink=true`, Preview/Production feedback disabled, and `ssoProtection={"deploymentType":"prod_deployment_urls_and_all_previews"}`. This is Vercel Authentication / Standard Protection, covering every Preview URL.
3. Read back and record the returned project ID and protection setting before storing credentials. Set Node `24.x`, `autoExposeSystemEnvs=true`, `autoAssignCustomDomains=false`, and `gitForkProtection=true` on that exact new project. Retain existing included resource defaults; no enhanced build machines or paid services. Keep the repository's `git.deploymentEnabled=false`; Git pushes must not trigger deployment. If protection cannot be verified, stop before deploying.
4. Configure the environment values below **only for Preview**, using secure secret inputs or the authenticated provider UI. Confirm variable names, types and target environment without reading secret values back into chat/logs. Do not fetch or print Supabase keys through the assistant's ordinary tool output. No credentials belong in GitHub Actions for this stage.
5. Use an explicitly approved one-off Preview deployment from the exact Git SHA. With the deployment API use the returned project ID, team ID above, `gitSource={"type":"github","repoId":"1428431731","ref":"<approved-full-commit-sha>"}`, and omit `target` (Preview). Do not use `withLatestCommit=true`, `target=production`, promotion, or an import flow that deploys main automatically. If private Git-source access is unavailable, stop and establish the provider's repository grant; do not broaden repository access or switch to an unreviewed source copy.
6. Read back deployment metadata. Require the approved SHA, correct project/team, Preview target, READY state, and Vercel Authentication protection. Record the immutable HTTPS URL returned by Vercel; do not invent one. Never enable a public share link or disable protection to make testing easier.

## Environment configuration

| Name                                   | Preview value / source                                                                                                   | Storage                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `SUPABASE_URL`                         | `https://ztiegrqflrpoksuocrze.supabase.co`                                                                               | Server-only Config                                              |
| `SUPABASE_SERVICE_ROLE_KEY`            | Key from **that project only**, supplied through secure provider secret input                                            | Server-only Secret; never `NEXT_PUBLIC_`                        |
| `MAINNET_WRITES_ENABLED`               | `false`                                                                                                                  | Config                                                          |
| `LOCAL_CHAIN_ENABLED`                  | `false`                                                                                                                  | Config                                                          |
| `NEXT_PUBLIC_LOCAL_CHAIN_ENABLED`      | `false`                                                                                                                  | Public Config                                                   |
| `ETHEREUM_RPC_URL`                     | `https://ethereum-rpc.publicnode.com` or an approved read-only provider                                                  | Server-only Config; Secret if it includes a provider credential |
| `ROBINHOOD_RPC_URL`                    | `https://rpc.mainnet.chain.robinhood.com`                                                                                | Server-only Config                                              |
| `BASE_RPC_URL`                         | `https://mainnet.base.org`                                                                                               | Server-only Config                                              |
| `SHAPE_RPC_URL`                        | `https://mainnet.shape.network`                                                                                          | Server-only Config                                              |
| `MEDIA_ALLOWED_HOSTS`                  | Empty; built-in IPFS gateways only                                                                                       | Config                                                          |
| `APP_ORIGIN`                           | **Omit for the first Preview**: the server derives `https://${VERCEL_URL}` only from Vercel's trusted system environment | Optional server Config override; must be an exact HTTPS origin  |
| `NEXT_PUBLIC_APP_ORIGIN`               | Omit for the initial injected-wallet preview                                                                             | Optional public Config, only needed with WalletConnect          |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Omit for the first acceptance pass; installed browser wallets work directly                                              | Optional public project identifier, not a credential            |

Vercel supplies `VERCEL=1`, `VERCEL_ENV=preview`, `VERCEL_URL` and the production Node runtime mode. Do not forge these as custom settings. The runtime refuses a different Supabase URL when `VERCEL_ENV=preview`, and refuses invalid/missing trusted client-IP headers. Use the immutable deployment URL; a different alias will intentionally fail the canonical-host/origin check unless separately configured. Never put `http://localhost:3000` from the local `.env.example` into Preview settings.

No database password, Supabase CLI access token, private key, wallet seed, `DATABASE_URL`, browser Supabase key, or new database migration is required. The service key's existing scope bypasses RLS; only trusted server code may hold it. Configure it after project protection is verified. Keep build/runtime logs free of environment dumps.

If WalletConnect is added to this protected preview after its initial pass, use an existing authorized project without buying resources, register the exact canonical HTTPS origin in that provider, and set both its public project ID and `NEXT_PUBLIC_APP_ORIGIN` to match `APP_ORIGIN`. Rebuild/redeploy under the same approved scope and test the finite CSP allowlist on the actual wallets. Do not expand CSP to arbitrary `https:`/`wss:`. WalletConnect/mobile and smart-account acceptance are not claimed by the injected-wallet pass.

## Acceptance and stop conditions

- Unauthenticated requests to `/`, `/api` and `/media` must encounter Vercel Authentication, including direct deployment URLs. Use authenticated team access. If automation needs a protection bypass, store it securely, send only as the approved header and avoid public/shareable/query-string links; do not record its value in evidence.
- Verify browser hydration, all five app routes, per-response CSP nonce, no blocked application scripts, no-store HTML/API responses, and absence of service credentials in browser bundles/network requests. Recheck the real Vercel forwarding-header behavior; local tests cannot establish the edge trust boundary.
- Verify exact HTTPS SIWE domain/URI; `__Host-` Secure/HttpOnly/Strict session and challenge cookies, readable Secure CSRF cookie, expiry, replay rejection, logout and chain switching. Sign messages only. No transaction signing or broadcast is authorized.
- Verify owner **and authorized non-owner admin** access, shared draft editing, optimistic version conflicts, pagination, private unpublished pages, metadata/images, and safe abuse responses. Do not introduce an owner-approval step. Verify revoked-admin denial using controlled fixtures or independently revoked roles; do not change GO1 or any real contract for the test.
- With permission to create clearly named preview-only draft/test rows in this same isolated database, verify PostgREST RPC and bounded table reads, persistence after restart/redeployment, and denied anon/authenticated database access. Preserve evidence and identify test rows; no destructive reset or cleanup without scope review. This application's server-to-PostgREST path is still an acceptance gate.
- `/api` must report all four network permissions false and `mainnetWrites=false`. Confirm preparation/preflight remains blocked for supported networks, without requesting wallet transactions.
- Preserve sanitized build/runtime/acceptance logs and stop. Failure, missing permission, unavailable protection, unexpected costs, credential-input limitations, or database/source drift are stop conditions. Do not promote, attach domains, enable writes, reapply migrations, or proceed to public minting.

## Recovery and operational limits

An unsuccessful Preview build may be diagnosed from sanitized logs. Re-deploying changed code needs an identified reviewed commit and successful CI. Keep protection enabled; do not delete unrelated projects, reset the database, or expose the service to troubleshoot. Any destructive recovery needs separate approval.

The GitHub ruleset read returned HTTP 403 with a plan restriction for this private repository. No upgrade or visibility change was made. Until enforced required checks are available, deployment is a manual gate against the exact successful CI SHA, and automatic Git deployments stay disabled. This operational limitation must be revisited before a broader/public release.

Official references: [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [Git deployment controls](https://vercel.com/docs/project-configuration/git-configuration), [system variables](https://vercel.com/docs/environment-variables/system-environment-variables), [secret/config variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [request headers](https://vercel.com/docs/headers/request-headers).

## Approval requested

Approve creation of this one protected Vercel project and one Preview deployment from the exact successful remediation commit, secure Preview-only credentials for `ztiegrqflrpoksuocrze`, and the bounded browser/database acceptance above. Approval would not authorize Production deployment, DNS, paid resources, schema changes, mainnet capability, or real blockchain transactions.
