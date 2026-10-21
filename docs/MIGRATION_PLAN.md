# Preview database migration — awaiting approval

This plan authorizes no execution by itself. No remote DDL, application rows, migration history, project settings, keys, or other databases were changed during preparation.

## Exact target and input

| Item                            | Required value                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Organization                    | Prof. NOTA Inc. / `kmvzxndegliuwirjzskb`                                                                  |
| Project                         | `transient-contract-manager-preview`                                                                      |
| Project ID                      | **`ztiegrqflrpoksuocrze`**                                                                                |
| Region / plan                   | `ap-northeast-2` / Free; no resource purchase                                                             |
| Observed state, 21 October 2026 | ACTIVE_HEALTHY; PostgreSQL 17.11; zero public tables; zero applied migrations; no conflicting TCM objects |
| Input                           | `supabase/migrations/20261021111911_core.sql`                                                             |
| Reviewed SQL SHA-256            | `5913b36084f40c1b8f9d56c4841e55ba0d3a6811c1669989555e416eca9913e6`                                        |
| Original source commit          | `c2974ab556a3c233f43b0a4d21d85fd551ea9fa6`                                                                |

Never select a project by its position in a list. Alpha Radar, NFT Indonesia Beta, and all other projects are outside this plan.

## Schema and security review

The migration creates ten application tables, one identity sequence, one PL/pgSQL RPC, six foreign keys, ten primary keys, two additional unique constraints, and nine explicit secondary indexes. It requires no extension installation, paid feature, Auth schema change, Storage bucket, Realtime publication, or blockchain access. `gen_random_uuid()` is present on the target. The reviewed SQL uses PostgreSQL 17-compatible types and syntax.

All ten tables enable RLS. There are intentionally **no anonymous or authenticated policies**: the browser communicates with the application server, not directly with private tables. Both roles are denied all table/sequence access and RPC execution. `tcm_command(text,jsonb)` is SECURITY INVOKER with `search_path=pg_catalog,public`; it has no dynamic SQL or elevated definer privileges. PUBLIC execution is revoked. The target's `service_role` has BYPASSRLS, and receives only SELECT/INSERT/UPDATE/DELETE on these tables, USAGE/SELECT on the identity sequence, and EXECUTE on the RPC. No TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, or sequence UPDATE grant is intended.

The original file revoked table permissions from anon/authenticated, but did not clear sequence grants or excessive default service-role grants. The target's actual defaults grant broad table and sequence privileges. The reviewed revision explicitly resets permissions on the ten named tables and the one named sequence before granting the intended permissions. It also adds expiry indexes for challenges, sessions and rate-limit records. No project-wide default privileges or platform roles are changed.

Collection identity is `(chain_id,address)`. Page, revision and audit relationships use foreign keys; slugs are unique; transaction hashes are unique per chain; draft saves use version checks and row locks. The API checks SIWE session chain and current on-chain owner/admin permission before private workspace operations. The database RPC trusts its service caller: RLS does **not** isolate collections from a compromised server/service credential. Audit rows and revisions are append-only by application convention, not tamper-proof against that credential. Retain this explicit trust boundary.

Indexes cover collection/page joins, publication history and expiry cleanup. `page_list` and revision history currently have no pagination. Growth limits, retention/cleanup scheduling and query profiling remain required before a public release. Reserved profile/media tables are empty and inaccessible to browser roles.

Local verification (`npm run db:verify`) passed on PGlite/PostgreSQL 17.5 with three privilege profiles: the observed Supabase defaults, extra legacy PUBLIC grants, and restricted defaults. It verifies transaction rollback, schema/RLS, invoker/search path, effective grants, actual denied queries, successful service RPC/identity sequence use, cross-chain collection isolation, unpublished-page privacy, and stale-version rejection. This is not a remote PostgreSQL 17.11 or PostgREST acceptance test.

The Supabase changelog was reviewed. Its PostgreSQL 17.11 extension/operator changes do not affect this new schema: it uses no ltree, btree_gist, PGP encryption or custom operators. The Data API default-grant change is handled by explicit object grants and revokes, verified under both broad and restricted defaults.

## Execution procedure, only after approval

Use the Supabase CLI migration runner so the existing version **20261021111911** is retained. The connected `apply_migration` operation exposes name/query but no version parameter; using it silently would generate a different remote migration version. Do not combine both routes or manually insert/delete migration-history rows.

1. Record the approved Git commit and verify the SQL SHA-256 above. Require a clean checkout and exactly this one pending migration. If either input changes, stop for review.
2. Re-read the target identity, health, PostgreSQL version, public object inventory, role attributes and migration history through read-only tools. Require the same project ID, zero application objects and zero migrations. Any collision is a stop condition: `IF NOT EXISTS` is not a schema-drift validator.
3. Use one operator/session. Authenticate the CLI securely through the provider flow or a managed credential input. CLI authentication is **not** inherited from the connected Supabase tool and has not been established in this session. Never paste a database password or service key in chat, command arguments, a report, or GitHub. No runtime service key is needed for schema review.
4. Use the inspected CLI version 2.121.0. Confirm command help again if the version changes. If local CLI initialization is needed, create its generated config in an isolated migration work directory and copy only the reviewed migration there. Do not start/reset a local or remote Supabase stack. Link explicitly with `supabase link --project-ref ztiegrqflrpoksuocrze`; verify the resulting local project reference before proceeding.
5. Preserve a schema-only pre-migration inventory/dump in protected storage, including object grants and migration-history state. The application schema is empty. Do not dump platform user rows, password hashes, or role secrets. Do not assume Free-plan PITR or backups are available.
6. Run `supabase migration list --linked`, then `supabase db push --linked --skip-vault --dry-run`. Expected pending set: only `20261021111911_core.sql`. The explicit `--skip-vault` flag prevents CLI secret synchronization. No seeds, roles, extra migrations, Vault updates, or unrelated schemas. Stop on any difference.
7. Execute **once**: `supabase db push --linked --skip-vault`. Keep normal transaction wrapping enabled. This migration has no nontransactional statements or transaction-disable directive. Tables, RLS, grants, indexes, function and migration recording must succeed as a unit. No application may connect until postchecks pass. Save sanitized output and exit status.
8. Re-read migration history: exactly one entry, version `20261021111911`, name `core`. Run the verification below, then stop and report. Approval of this plan is not approval for Vercel, DNS, production database work, or mainnet writes.

## Verification and acceptance

Run the read-only catalog and row-count queries in `supabase/verification/core.sql` against the exact target. Require:

- Exactly the ten named tables; all RLS enabled; zero policies; zero rows before smoke testing.
- One `tcm_command(text,jsonb)` RPC; SECURITY INVOKER; fixed search path.
- No effective table, sequence or RPC access for anon/authenticated, including access inherited through PUBLIC.
- Only the stated service privileges; nine explicit indexes plus constraint-backed indexes; expected foreign keys and unique constraints.
- A service-role RPC call to `page_list` on a nonexistent test collection returns `[]`. Role-switched anon/authenticated calls to the RPC and each private table fail with permission denied. Use short transactions and rollback; do not manufacture or log API credentials.
- Run security and performance advisors. Review every returned issue. RLS-enabled-with-no-policy notices are intentional for this server-only design; never add a broad policy just to silence them.
- Record schema/migration fingerprints and a sanitized verification report. A later protected hosted test must separately prove PostgREST connectivity, HTTPS SIWE, server credential handling and persistence. This stage does not claim those tests passed.

## Failure and recovery

**Error before commit:** stop; inspect schema and migration history read-only. Expected outcome is zero TCM objects and no migration record because the runner wraps this file in a transaction. If both are empty, diagnose locally and obtain approval for any SQL changes before retrying. Do not blindly rerun after a timeout: a lost response can hide a committed transaction.

**Commit succeeded but verification failed:** keep the application disconnected and all transaction gates false. Preserve catalog state and logs. Prefer a reviewed forward-fix migration. Never run `db reset --linked`, drop `public`, delete the project, or repair history to conceal a partial result.

**Empty-schema rollback, if separately approved:** first prove all ten tables remain empty and there are no outside dependencies. Create a new rollback migration with the CLI generator. Drop the RPC, then `publication_records`, `audit_logs`, `mint_page_revisions`, `collection_profiles`, `media_assets`, `mint_pages`, `collections`, `auth_challenges`, `app_sessions`, and `rate_limits` in dependency order, without CASCADE. The audit identity sequence is owned by its table and drops with it. Preserve migration history; do not pretend the original migration never ran. A subsequent redeployment needs a new forward migration.

**Any data exists:** no destructive rollback. Quiesce the app, take a protected backup, verify restore into an approved isolated destination, and propose a forward repair. Creating that destination or paying for recovery capacity requires separate authorization. Do not use another existing Supabase project as a recovery sandbox.

## Approval requested

Approve the reviewed SQL hash and execution/verification procedure **only for `ztiegrqflrpoksuocrze`**, after secure CLI authentication is available. No migration has been applied. Destructive recovery, deployment, DNS changes and mainnet activation remain outside this approval.

References: [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [CLI transaction behavior](https://supabase.com/docs/guides/local-development/cli-workflows), [API grants](https://supabase.com/docs/guides/api/securing-your-api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [17.11 changelog](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), [Data API defaults](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
