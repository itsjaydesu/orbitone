RELEASED-LEASE: owner=claude-opus-orch@asuka acquired=2026-09-23T09:45:14Z token=5ba86663 heartbeat=2026-09-23T09:45:14Z state-dir=feature-research/pr-merge-train-0923

# PR merge train 0923 (orbitone)

Adapted from lets-tango `pr-merge-train`. Orbitone has no review:train, review:wave or review:ui tooling. ORCH runs the phases by hand.

## Phase 0: Preflight
- Default branch: master @ 4dd487e. No branch protection. No required checks.
- CI on PRs: Vercel preview, `claude-review` Action (/code-review --comment).
- Open PRs: 1 (#8). Drafts: 0. No live train lease in any worktree.

## Phase 1: Dossier
- #8 feat/visual-polish-bloom @ e29c41d. UI polish: bloom down, lit staff arc, seekbar fill, arrow-key fix (bug on master). Strike ripple removed on Jay's request (2026-09-23).
- Tests 129/129. tsc clean. Touched-file lint = master baseline (DIG-3939).
- QA: rounds 1-2 on dev server (QA_PASS round 2). Final-head QA: running.
- Review: advisory Claude reviewer (findings fixed). Codex local and Codex GitHub bot both out of quota (reset 2026-09-24 15:02 JST). Grok breadth review: running.
- Linear: no DIG issue (Linear MCP not authenticated in this session).

## Phase 2: Conflict probe
- `git merge-tree --write-tree origin/master e29c41d`: clean. Head contains origin/master.

## Phase 3: Order
- Single leg: #8.

## Phase 4: Plan gate
- Jay (2026-09-23): run Codex review via OpenRouter; sign in to Linear and file. Jay (2026-09-24): merge with the residual P2 as a follow-up.

## Phase 5: Leg #8
- Round 3: strike ripple removed (e29c41d), on Jay's request.
- Final QA on e29c41d: QA_FAIL. Seekbar focus was lost on chrome auto-hide (bug also on master). Vercel build failed on Google Fonts (transient).
- Round 4 (a01a1b8, Opus fallback because Fable hit its limit): focus hold. Astra: REVIEW_FAIL, 4 findings.
- Round 5 (3d976e9): hold on `:focus-visible` with a re-armed idle check, in hook tests. Astra: REVIEW_FAIL on 1 residual P2 plus a P3 test note. Jay accepted both as follow-up DIG-3997.
- QA_PASS on 3d976e9 (desktop and mobile, flows A-F). Vercel Ready. claude-review pass.
- Merged: squash 6fd4d72, first parent 4dd487e (master at reread). Branch deleted. Tag run/visual-polish-bloom.

## Phase 8: Completion
| PR | Squash | Linear |
|---|---|---|
| #8 | 6fd4d72 | DIG-3996 (Done) |

Follow-ups: DIG-3997 (chrome keyboard/AT gaps), DIG-3998 (allowedDevOrigins .asuka), DIG-3999 (dotfiles provider-lanes broken import), DIG-4000 (Portless port collision).

## Retrospective
- Reviewers:
  - GPT-6 Astra via OpenRouter found 4 real defects in the focus fix and passed the visual diff.
  - The Claude advisory reviewer found the instanceColor shader recompile and the wrong bloom comment.
  - Grok hit max turns twice and produced no output.
  - The Codex CLI and the Codex GitHub bot were both out of quota.
- Browser QA caught the ripple trails on mobile and the focus bug on master. Unit tests could not catch either.
- Feedback:
  - The OpenRouter lane is dead (DIG-3999). The direct `codex exec` with inline provider config works and should become the documented fallback.
  - `pr-merge-train` is lets-tango-only. Orbitone has no review:train tooling, so ORCH ran the phases by hand.
  - The first focus fix used a hand-rolled keyboard/pointer flag. `:focus-visible` together with a re-armed timer was the better first design.
