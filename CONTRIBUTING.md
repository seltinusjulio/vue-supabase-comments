# Contributing

This module is consumed as a git submodule at `packages/comments` by two apps:

- ofmcap-web (`ofmcappontianak/ofmcap-web`)
- nyl-dev (`nyanyianliturgi/nyl-dev`)

Both apps talk to a PostgreSQL database through the Neon Data API (PostgREST),
using `@supabase/supabase-js` only as the client. A change here lands in two
production apps, so the order of steps below matters.

## What belongs where

| Module (this repo)                                                      | Consumer app                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------- |
| UI components, `useCommentTree`, the adapter contract, i18n presets     | Adapter implementation, queries, RPCs, RLS                          |
| Theme tokens (`--comment-*`) and default styles                         | Theme overrides, toast and error logging, author badge, login CTA   |
| Reference SQL recipe (`sql/comments_schema.sql`)                        | Its own migrations, which may differ from the recipe                |
| Nothing that names a host's domain (songs, friars, articles, locations) | Target labels and URLs, who counts as a moderator, guest/attachment |

If a change names something from one host, it belongs in that host.

## Working on the module

1. Do the git work (branch, commit, push, PR) in a standalone clone of this
   repo, not inside a consumer's `packages/comments`. A submodule is always a
   detached HEAD, and its local `main` goes stale.
2. Branch from `origin/main`, open a PR, and merge it with a merge commit.
3. Run `npm ci`, `npm run typecheck`, and `npm test` in this repo. CI runs the
   same three steps on every push to `main` and on every PR.
4. When a change touches anything the consumers share (types, adapter
   contract, props, message keys), also check the branch in both consumers
   before merging: check it out inside that consumer's `packages/comments`
   and run the consumer's `npm run typecheck:comments` and
   `npx vitest run packages/comments`. Do not commit the consumer's pointer
   while testing.

## Bumping consumers

After the module PR is merged, open one small PR per consumer
(`chore/bump-comments-module`) that moves the submodule pointer.

- A pointer may only reference a commit that is on this repo's `origin/main`.
  Never commit a pointer to an unmerged branch. Each consumer's CI enforces
  this with `git merge-base --is-ancestor`, so a pointer to a branch-only
  commit fails the build.
- Run the consumer's comments typecheck and the tests that touch comments
  before merging the bump.

## Breaking changes

A change to the public types, the adapter contract, props, or message keys
needs:

- an entry under "Unreleased" in `CHANGELOG.md`, and
- bump PRs in both consumers on the same day, so neither is left behind.

## Releases

Releases are annotated git tags named `vX.Y.Z` on a merge commit on `main`.
The consumers still point at a commit, not a tag; the tag makes the history
and `CHANGELOG.md` readable.

To release, in one PR: set `version` in `package.json` and move the
"Unreleased" entries in `CHANGELOG.md` under a heading for that version and
date. After the PR is merged, tag the merge commit and push the tag:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z" <merge-commit>
git push origin vX.Y.Z
```

## Keeping the checkouts clean

When you want to confirm nothing is left over, measure every checkout (both
consumers, both submodule copies, and the standalone clone) after
`git fetch --prune`: uncommitted changes, stashes, `main...origin/main`,
local and remote branches, and open PRs.

To tell whether a branch is already merged, use `git cherry origin/main <branch>`
(a `-` means the patch is upstream). Do not rely on
`git branch -r --contains`: PRs can be merged as new commits, so the hash is
not found even though the change is.

Useful local settings:

```bash
git config --global submodule.recurse true
git config --global status.submoduleSummary true
git config --global push.recurseSubmodules check
```

`push.recurseSubmodules check` refuses to push a consumer whose submodule
commit has not been pushed.
