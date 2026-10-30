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
3. This repo has no dev dependencies, scripts, or CI of its own. Its tests and
   typecheck run through a consumer: push the branch, check it out inside that
   consumer's `packages/comments`, then run the consumer's
   `npm run typecheck:comments` and `npx vitest run packages/comments`.
   Do not commit the consumer's pointer while testing.
4. Check the branch in both consumers before merging when the change touches
   anything they share (types, adapter contract, props, message keys).

## Bumping consumers

After the module PR is merged, open one small PR per consumer
(`chore/bump-comments-module`) that moves the submodule pointer.

- A pointer may only reference a commit that is on this repo's `origin/main`.
  Never commit a pointer to an unmerged branch.
- Run the consumer's comments typecheck and the tests that touch comments
  before merging the bump.

## Breaking changes

A change to the public types, the adapter contract, props, or message keys
needs:

- an entry under "Unreleased" in `CHANGELOG.md`, and
- bump PRs in both consumers on the same day, so neither is left behind.

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
