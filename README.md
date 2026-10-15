# agent-compaction

One compaction policy for every coding agent, taken from Claude Code 2.1.300:

- **Threshold.** `W = min(model context, 300000)`; compact at
  `min(floor(85% × (W − min(max output, 20000))), W − min(max output, 20000) − 13000)`.
- **Skills after compaction.** Newest first, each cut to 5000 tokens with a
  marker, 25000 tokens in total; a skill that does not fit is dropped for the rest of the
  session.

`src/core` holds the policy as pure functions, `src/ports.ts` what a host provides, and
`src/adapters/<agent>` one adapter per agent.

## Adapters

- **OpenCode v2** — a plugin. Add to `opencode.jsonc`:
  `"plugins": ["agent-compaction@git+https://github.com/BohdanParkhomenkoNix/agent-compaction.git"]`.
  Options: `{"package": "...", "options": {"buffer": N}}` when `compaction.buffer` is set
  (plugins cannot read the config); `cap` overrides 300000.
  Errors go to `~/.cache/agent-compaction/opencode.log`.
- **Claude Code** — native. Set `CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000` and
  `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=85`; Claude Code restores skills itself.

## Tests

`npm test`, `npm run typecheck`.
