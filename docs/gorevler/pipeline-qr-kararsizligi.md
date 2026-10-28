# Pipeline CI: flaky QR time-code test

## Problem
The `ci-pipeline` job fails intermittently, with no code change behind it, in the Supabase integration tests. Examples so far:
- `tests/test_chain_supabase.py::test_scan_to_owner`: `error: only 0 readable QR time codes (need 3)`, in run 40615234039 on `claude/ip13-demo-erisim`.
- `tests/test_checks_supabase.py:76`: `error: only 1 readable QR time codes (need 3)`, in run 40624603970 on `claude/ip13-demo-arayuz`.

Neither PR touched `services/pipeline`, and both failures passed on rerun. Of the last 30 runs, at least 2 failed this way.

## Task
1. `git fetch origin && git checkout -B claude/pipeline-qr-kararsizligi origin/main`.
2. Read `CLAUDE.md`, `docs/gorevler/README.md`, `services/pipeline/README.md` and `docs/arayuzler.md` (the QR time-code section).
3. Find the root cause. Run the two tests in a loop (for example 20–30 times, in the background) and look at how the synthetic video's QR frames are generated and decoded. Candidates include encoder randomness, frame timing or seek, ffmpeg version, the decoder's thresholds, `--seed` not being fixed in these tests, and CPU-dependent timing.
4. Fix the cause in the generator or in the decoder's robustness. Do not just retry the test or lower the `need 3` threshold. The production rule must stay as it is.
5. Show the fix holds: at least 30 consecutive passing runs of both tests, both locally and in CI.
6. Open a PR with `gh api repos/yusuftiryaki/orchadOS/pulls -f head=claude/pipeline-qr-kararsizligi -f base=main ...`. Write the description in Turkish and include the root cause, the fix and the loop results. End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Never merge PRs and never push to main.
