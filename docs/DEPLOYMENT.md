# Deployment runbook

Current stage: hosted-preview security preparation, 22 October 2026. No Vercel project or deployment has been created. DNS and production settings remain outside this stage.

Use [PREVIEW_PLAN.md](PREVIEW_PLAN.md) as the exact procedure for the next, separately approved protected Preview. It specifies the team, proposed project, exact-commit CI gate, protection-before-credentials sequence, Preview-only environment variables, secure credential inputs, canonical origin, acceptance checks and recovery boundaries.

The source repository is private: `myreceiptt/transient-contract-manager` (ID `1428431731`). Original commit `c2974ab556a3c233f43b0a4d21d85fd551ea9fa6` remains in history. Security remediation starts at `ce29b03e5ad406ee6687f7d797e2472f7fd2a4eb`; the stage report names the exact final commit and CI run.

The Supabase project `transient-contract-manager-preview` / `ztiegrqflrpoksuocrze`, organization `kmvzxndegliuwirjzskb`, region `ap-northeast-2`, already contains approved migration `20261021111911` / `core`. It was applied by the user through an authenticated CLI and independently verified read-only. **Do not reapply the migration.** The historical [migration plan](MIGRATION_PLAN.md) remains recovery/reference material, not an instruction to repeat it.

Vercel team `prof-nota` / `team_DlAJnjQegWeVLHocsTBVq1Kw` is readable. There is no matching TCM project; write permissions remain untested. The repository disables automatic Git deployments. Normal CI has contents-read permissions and no deployment job. GitHub private-repository rulesets returned a plan-related 403, so use manual successful-CI commit pinning without upgrading or changing repository visibility.

All supported-network write permissions are hard-disabled in this preview release; `MAINNET_WRITES_ENABLED=false` remains required. Local-chain test execution is confined to loopback outside production/Vercel. Autonomous authorized-admin sale management is preserved by application authorization and local regression tests, with no added owner-approval step.

Read [PREVIEW_SECURITY.md](PREVIEW_SECURITY.md) for completed fixes, tests and remaining risks. Hosted browser/PostgREST acceptance is still required. Public minting, network/action release controls, production infrastructure, the eventual `transient.endhonesa.com` domain, purchases and real blockchain transactions all require later, separately scoped work.
