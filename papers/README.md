# VibeOS paper package

This directory contains a conservative arXiv-style manuscript for VibeOS, a browser-hosted imagined/local OS prototype with lazy backend-owned app generation.

## Contents

- [`main.tex`](main.tex) is the manuscript source.
- [`references.bib`](references.bib) contains the cited literature and repository reference.
- [`CLAIMS.md`](CLAIMS.md) maps every major claim to current source evidence and a caveat.

## Evidence scope

The paper reports only source-level behavior supported by the current repository. The recorded check is `npm test` from the VibeOS root: the server TypeScript build and 75 tests passed on 2026-09-01. The paper does not report provider-backed generation quality, performance, security, accessibility, browser visual quality, or a benchmark result.

The source snapshot is VibeOS `0.1.0` at revision `90b23f277a52c1862a764a97a9ddd99c8630e4f4`. The working tree had pre-existing documentation edits during preparation; consult `CLAIMS.md` before treating the revision as a clean release artifact.

## Reproduction

From `/home/z/vibe/vibeos/`, install Node.js 20+, npm, and dependencies, then run:

```text
npm install
npm test
```

Live generation additionally requires the configured external worker/provider described by the root README. It is intentionally excluded from the deterministic evidence claim.

## Compilation

`pdflatex`, `latexmk`, `bibtex`, and `biber` were not available in the preparation environment, so no PDF is included and no generated compilation files were added. With a LaTeX toolchain, compile from this directory with `pdflatex main.tex`, `bibtex main`, and two further `pdflatex main.tex` runs; keep auxiliary files out of version control.

## Submission status

This is a local source package, not an uploaded arXiv submission. It has no arXiv identifier, DOI, dataset, benchmark bundle, generated-job corpus, or author identity claim beyond the manuscript’s generic author line. Strengthening those items requires new evidence and explicit publication decisions.
