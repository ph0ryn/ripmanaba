# Technology Selection

## Status

Initial selection for ripmanaba.

This document records decisions that are already fixed and items that must be
decided after scraping investigation.

## Decisions

### Runtime

- Target runtime: Bun only.
- The CLI does not target Node.js compatibility as a primary goal.
- TypeScript remains the implementation language.
- The existing pnpm-based development setup is kept for now.

### CLI Framework

- Use `cac`.
- Reason:
  - Small API surface.
  - Supports subcommands, aliases, options, help, and version output.
  - Fits commands such as `ripmanaba course|crs ls`.

### Browser Automation

- Use Playwright Chromium for login and initial scraping PoC.
- Use Playwright's persistent browser context for session persistence.
- Store browser state in a dedicated ripmanaba profile directory.
- Do not automate the user's default Chrome profile.

Expected profile location:

```text
~/.ripmanaba/browser-profile
```

### Authentication Flow

- `ripmanaba auth` opens Playwright Chromium.
- The user logs in to manaba manually.
- The authenticated browser state is kept in the dedicated profile directory.
- Later commands reuse that profile when accessing manaba.

## Deferred Decisions

### Scraping Strategy

The final scraping strategy is intentionally undecided until manaba page
structure has been investigated.

Candidates:

- Playwright-only browser automation.
- Login with Playwright, then fetch pages and parse HTML.
- Hybrid approach:
  - Use Playwright for login and dynamic pages.
  - Use direct HTTP fetching and HTML parsing for stable pages.

The likely default is the hybrid approach, but it must be confirmed by PoC.

### HTML Parser

Do not select an HTML parser yet.

Select one only after confirming whether direct HTML parsing is useful for the
target manaba pages.

## Investigation Plan

1. Use a dedicated PoC branch for scraping investigation.
2. Inspect manaba page structure with browser automation tools.
3. Record page structure findings under `docs/`.
4. Create focused PoCs under `poc/` for each target workflow.
5. Decide whether each workflow should use Playwright, HTTP scraping, or a
   hybrid method.
6. Update this document when the scraping strategy is finalized.
