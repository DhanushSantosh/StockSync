# Contributing to StockSync

Keep changes focused on useful inventory workflows and clear analysis. Open an issue or describe the behavior in a pull request before a large change.

## Local setup

Use Node.js 22 and Java 21. Run `npm ci`, copy `.env.example` to `.env`, and fill in your own Firebase web app settings as described in [README.md](README.md). Keep `.env` and real shop exports out of Git. A Firebase web config is public client configuration; Firestore Security Rules control data access.

## Before a pull request

```bash
npm run lint
npm test
npm run test:rules
npm run build
```

The Firestore emulator test needs Java. CI runs these same checks without production Firebase credentials. Add a focused test when changing stock calculations, Firestore writes or rules, CSV parsing, or analysis features. Explain any test that cannot be run.

Do not commit real customer or transaction exports. Deployment to Firebase Hosting is a separate, deliberate step after review; CI only verifies changes. The separate StockDemandPrediction project owns the analytics pipeline and reports.
