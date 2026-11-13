# Contributing to Obsidian Telemetry

Thank you for your interest in contributing to Obsidian Telemetry. This project is 100% free, open-source software licensed under the MIT License.

## Development Workflow

1. Fork the repository and create a branch from `main`:

```bash
git checkout -b feat/short-descriptive-name
```

2. Install dependencies and start the local development server:

```bash
npm install
npm run dev
```

3. Verify TypeScript types and production bundle compilation before opening a Pull Request:

```bash
npm run lint
npm run build
```

## Engineering Standards

- **TypeScript Strictness**: Use explicit types and standard TypeScript enums. Avoid `any`.
- **Tailwind CSS**: Keep styling within Tailwind utility classes and design tokens declared in `src/index.css`.
- **Interactive Completeness**: Every UI control (filters, buttons, table rows, terminal commands) must be wired to a working state handler. Do not introduce static placeholders or dead affordances.
- **Accessibility**: Maintain keyboard navigability, `aria-label` attributes on icon-only buttons, and readable contrast across dark surfaces.

## Pull Request Checklist

- [ ] `npm run lint` passes with zero errors
- [ ] `npm run build` succeeds cleanly
- [ ] New components follow the Obsidian Telemetry color, typography, and tabular numeral conventions
- [ ] Commit messages use concise imperative phrasing (e.g., `Add regex filter reset in LogsScreen`)
