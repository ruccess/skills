# Third-party notices

The selected workflow ideas in `dev-plan`, `dev-build`, and `dev-ship` refer to Matt Pocock's `to-tickets`, `tdd`, `code-review`, and `pr` skills at [commit 49dd158d1076134a641b33efb035946536778336](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336).
The source files are linked in the corresponding skill instructions.
The upstream `pr` skill also credits Dex Horthy / Humanlayer's [show-me](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md).
The [upstream license](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/LICENSE) is preserved below.

```text
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Review severity in `dev-ship`

The finding-verification and severity rules in `dev-ship` are distilled, not copied, from these MIT-licensed sources:

- t3dotgg/tstack `skills/sol-loop/SKILL.md` — consequence-based blocker/should/nit grading and re-judging labels.
- obra/superpowers `skills/subagent-driven-development/task-reviewer-prompt.md` at commit 22f0b463e7a5e579904dd6211a520321035526f7 — the definition of a finding that blocks trust in the task.
- addyosmani/agent-skills `skills/code-review-and-quality/SKILL.md` at commit 353ae84755adc40c8a84e4db29b5bf2dfc9e7f5b — verifying findings against callers, guards, and tests, and accepting zero findings.

## Caveman licensing

`korean-chat` distills principles from JuliusBrussee/caveman releases before 3.0.0, which were MIT-licensed.
Caveman 3.0.0 (commit 921eab8, 2026-09-24) relicensed the repository to Apache-2.0 and keeps the earlier MIT text as `LICENSE-MIT`.

## Other distilled sources

These sources are credited in skill instructions or by an upstream skill but have no notice above.
Their principles are distilled, not copied, and each source is MIT-licensed.

| Source | License | Used by |
| --- | --- | --- |
| obra/superpowers `skills/brainstorming` | MIT, Copyright (c) 2025 Jesse Vincent | `brainstorm` |
| mattpocock/skills `skills/engineering/grill-with-docs` | MIT, Copyright (c) 2026 Matt Pocock | `grill` |
| ayghri/i-have-adhd | MIT, Copyright (c) 2026 Ayoub Ghriss | `korean-chat` |
| DaleSeo/korean-skills | MIT, Copyright (c) 2026 Dale Seo | `korean-docs` checklist |
| humanlayer/skills `show-me` | MIT, Copyright (c) 2026 HumanLayer | referenced by the upstream `pr` skill |
