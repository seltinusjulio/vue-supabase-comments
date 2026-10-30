# Changelog

All notable changes to this module are recorded here. The module is not yet
published to a registry; versions are git tags (see `CONTRIBUTING.md`).
Changes not yet released go under "Unreleased".

## 0.1.0 - 2026-10-30

First tagged version.

### Added

- `CONTRIBUTING.md` describing the multi-repo submodule workflow.
- Standalone `typecheck` and `test` scripts with their own dev dependencies and
  a Vitest config, so the module can be checked without a consumer.
- GitHub Actions workflow running the typecheck and tests on `main` and on
  pull requests.

### Changed (breaking)

- `CommentModerationTable` no longer maps `target_type` `"song"` and
  `"article"` to built-in labels. A target is labelled through the
  `targetLabel` prop; without it, the raw `target_type` is shown.
- Removed `targetSong` and `targetArticle` from `CommentMessages.moderation`
  and from the `id` and `en` presets. Hosts that set these keys in an inline
  `messages` override must drop them (TypeScript reports them as unknown
  properties). Values passed through a variable still compile, but are unused.
