# Changelog

All notable changes to this module are recorded here. The module is not yet
published to a registry, so entries are grouped under "Unreleased" until the
first tagged version.

## Unreleased

### Changed (breaking)

- `CommentModerationTable` no longer maps `target_type` `"song"` and
  `"article"` to built-in labels. A target is labelled through the
  `targetLabel` prop; without it, the raw `target_type` is shown.
- Removed `targetSong` and `targetArticle` from `CommentMessages.moderation`
  and from the `id` and `en` presets. Hosts that set these keys in an inline
  `messages` override must drop them (TypeScript reports them as unknown
  properties). Values passed through a variable still compile, but are unused.
