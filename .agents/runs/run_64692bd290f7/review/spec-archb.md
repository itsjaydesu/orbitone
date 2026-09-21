# ARCH-B: must fix before freeze

Reviewed `scratch/spec-archb-input.md` against source `3ee74f349f70074aba0ee0f9daf4ec39398c541d` and coordinator baseline.

- **P2, §4:** Separate desired contracts from known-bug characterization. Focused seekbar arrows currently switch tracks (`app/page.tsx:1288`). Record that defect explicitly; do not approve it as correct behavior.
- **P2, §4:** Sample-download failure leaves initialization pending (`hooks/useMusic.ts:319`). Test bounded pending/loading behavior; never invent rejection. Defer recovery.
- **P2, §§2–3:** M1 authors tests/tooling only. Independent QA runs baseline and candidate browser measurements and owns evidence. Insert QA checkpoints before ORCH approval.
- **P2, §§5–7:** Compare identical production builds, browser versions, settings, warmup, and windows. Record these with SHA. Add measured main-thread CPU time and an explicit acceptance threshold; rAF and long tasks cannot substitute.
- **P2, §§5–7:** Remove per-page commit gating unless a validated attribution method exists. Generic CDP collection does not establish component commits.
- **P2, §6:** Limit 2Hz updates to text. Require smooth seekbar motion and immediate seek, pause, end, and track-change updates.
- **P2, §§5,8:** Specify unique PM2/Portless worktree service names; resolve their exact URLs.
- **P2, §6:** Preserve existing frame-loop transport reads (`components/Visualizer.tsx:228`) and explicit export timing. Start with publishing fewer page updates.

MUST_FIX
