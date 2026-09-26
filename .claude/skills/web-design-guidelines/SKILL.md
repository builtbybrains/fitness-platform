---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

A vendored copy lives next to this file at `guidelines.md` (read it first; it works offline). When the network is reachable, fetch the newer upstream copy from:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

If the fetch fails, use `guidelines.md`. Either file carries every rule and the output format.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md` (or the fetched upstream copy)
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
