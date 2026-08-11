# Eslam.AI

Arabic-first AI mentorship application, built incrementally through reviewed pull requests.

## Current scope

Task 00 establishes the engineering foundation only:

- Next.js App Router + TypeScript
- Tailwind CSS
- ESLint and strict TypeScript checks
- GitHub Actions validation
- CodeRabbit review configuration
- repository structure and contribution guardrails

Product features, authentication, Supabase, AI, and the luxury design system are intentionally deferred to later tasks.

## Requirements

- Node.js 20.9 or newer
- npm

## Local development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Every feature is developed on its own branch and merged only after automated checks and review are complete.
