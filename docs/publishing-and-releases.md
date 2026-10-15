# Publishing and Releases

The package publishes to [npmjs.com](https://www.npmjs.com/package/@nicolopadovan/persistent-state) from GitHub Actions
with npm trusted publishing: no npm token is stored. Versions and the changelog are managed with
[Changesets](https://changesets.dev), configured in [`.changeset/config.json`](../.changeset/config.json) with
`access: public` and `baseBranch: main`.

## Versioning

- Every 0.x minor may contain breaking changes. Patches never do. The package README, the docs home page and the
  installation page say so.
- 1.0.0 follows the roadmap core (0.4.0 to 0.10.0) and removes the deprecated aliases.
- Versions up to 0.2.1 were published privately to GitHub Packages. The first public release on npm continues from
  0.2.1: a single changeset with a `minor` bump takes the package to 0.3.0 and describes the release.
- Each release is tagged `v<version>`, as the archived private repository's `v0.1.0`, `v0.2.0` and `v0.2.1` were. Those
  tags do not exist in this repository, whose first tag is `v0.3.0`. No workflow publishes to GitHub Packages any more,
  so a tag never publishes anything by itself.

## One-Time Setup

1. Rename the private repository to keep it as the archive (for example `persistent-state-archive`, still private).
   Then create the public repository `nicolopadovan/persistent-state` with a single initial commit holding the release
   tree. npm adds provenance only for public repositories. Every step below that configures GitHub happens after this
   repository exists.
2. In the repository settings → Environments, create `npm` with yourself as a required reviewer and with deployment
   branches limited to `main`. Do this before the Release workflow first runs: GitHub creates a missing environment
   without protection rules when a job references it. The publish job waits in `npm` for your approval.
3. In the repository settings → Actions → General, allow GitHub Actions to create and approve pull requests, so the
   release pull request can be opened.
4. From your own terminal, run `npm login`, then publish a placeholder so the package exists on npm: in an empty
   directory, a `package.json` with `"name": "@nicolopadovan/persistent-state"`, `"version": "0.0.0"`,
   `"license": "MIT"`, a `description` saying the name is reserved until 0.3.0, and the `repository` field, then
   `npm publish --access public` (scoped packages are private by default). After 0.3.0 is published, run
   `npm deprecate @nicolopadovan/persistent-state@0.0.0 "Placeholder; use 0.3.0 or later."`.
5. On npmjs.com, open the package settings → Trusted publishing → GitHub Actions, and enter owner `nicolopadovan`,
   repository `persistent-state`, workflow `publish-package.yml` and environment `npm`. Under "Allowed actions", allow
   `npm publish`: configurations created after 2026-09-03 default to staged publishing only, which would stage the
   release instead of publishing it. npm expires a trusted publisher configuration that has not completed a successful
   publish within 2 days of its creation, so create it shortly before the first release.
6. In the repository settings → Pages, set the source to GitHub Actions and the custom domain to
   `persistent-state.nicolopadovan.com`. At your DNS provider, add a `CNAME` record from `persistent-state` to
   `nicolopadovan.github.io`, with the Cloudflare proxy off. Then turn on Enforce HTTPS. In your account settings →
   Pages, verify `nicolopadovan.com` with the TXT record GitHub shows, so no other account can serve a site on its
   subdomains.

The Docs workflow deploys the documentation site on every push to `main`.

## Planning Versions

Each version has a [milestone](https://github.com/nicolopadovan/persistent-state/milestones) with its target date, and
each change in it an issue. A new request goes to the next open milestone, never to the version being released. Roadmap
items with no target yet carry the `roadmap` label and no milestone.

## Release Steps

1. Each pull request that changes the package adds a changeset (`pnpm changeset`).
2. On `main`, the Release workflow ([`publish-package.yml`](../.github/workflows/publish-package.yml)) opens or updates
   a "Release persistent-state" pull request that bumps the version and writes the changelog from the pending
   changesets.
3. Close and reopen that pull request. Events caused by the workflow's `GITHUB_TOKEN`, including opening or updating a
   pull request, do not trigger other workflows, so the required checks (`check`, `min-versions` and `secrets`) do not
   start by themselves. Reopening the pull request as yourself starts them. Repeat after every update of the release
   pull request.
4. Merge the release pull request once the checks pass. This runs the Release workflow again. It sees a version that is
   not on npm yet and waits for approval in the `npm` environment. After approval, the publish job installs with the
   frozen lockfile and runs the package's typecheck, lint, tests and build, then `check:package`. The release pull
   request has already passed the required `check` job, which includes the browser tests. The publish job then
   publishes with `npm publish` from `packages/persistent-state`, using trusted publishing (OIDC, `id-token: write`)
   with provenance, and pushes the annotated tag `v<version>`. It runs only on `main`: a manual run of the Release
   workflow from another branch publishes nothing.

A version set by hand in `package.json` is published the same way once it reaches `main`, because the workflow
publishes whenever `main` carries a version that is not on npm and no changeset is pending.

## Prereleases

Releases are stable versions under the `latest` dist-tag. To publish prereleases, run `pnpm changeset pre enter <tag>`
(for example `rc`) and merge; versions then carry a suffix such as `0.4.0-rc.0`, and the workflow publishes any version
with a suffix under the `next` dist-tag, so `npm install @nicolopadovan/persistent-state` keeps getting the latest
stable version. Run `pnpm changeset pre exit` and merge to return to stable releases.

## When The Workflow Fails

Check:

- `pnpm-lock.yaml` is committed
- the publish job still has `id-token: write` permission
- npmjs.com lists this repository, `publish-package.yml` and the `npm` environment as the package's trusted publisher,
  and the configuration has not expired
- the release pull request's checks ran: a pull request that shows no checks needs the close and reopen from step 3
- the publish job's checks passed; a failure there leaves the version unpublished, and the next push to `main` or a
  manual run of the Release workflow tries again

If `npm publish` succeeds but pushing the tag fails, a rerun does not publish again, because the version is on npm. Push
the tag by hand: `git tag -a v<version> <release commit> -m v<version>`, then `git push origin v<version>`.
