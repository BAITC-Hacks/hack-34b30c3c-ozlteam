---
name: surgical-patches
description: Make minimal, reviewable edits to existing files in this repository while preserving UTF-8, line endings, formatting, and concurrent team changes. Use for every code or text modification, especially in a dirty working tree or multi-agent task.
---

# Surgical patches

- Check `git status --short` and the target diff/region before editing.
- Treat existing changes as user/team work unless clearly yours.
- Use `apply_patch` for small edits; never rewrite whole files unnecessarily.
- Preserve encoding, BOM, line endings, indentation, quoting, and local formatting.
- Do not change unrelated code, files, names, formatting, or generated artifacts.
- In shared workspaces, recheck the target before patching and avoid overlapping edits.
- Use project tools for generated files.
