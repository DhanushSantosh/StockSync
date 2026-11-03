# Contributing to StockSync

Keep changes focused on useful inventory workflows and clear analysis. Open an issue or describe the behavior in a pull request before a large change.

## Local setup

Use Node.js 22, Python 3.12, and Java 21. Run `npm ci`, copy `.env.example` to `.env`, and fill in your own Firebase web app settings as described in [README.md](README.md). Keep `.env`, downloaded UCI data, virtual environments, and real shop exports out of Git. A Firebase web config is public client configuration; Firestore Security Rules control data access.

For analytics, install `analytics/requirements.txt` into a Python 3.12 virtual environment. The committed demo CSVs are generated practice data. The UCI workbook is downloaded separately; its path and reproduction commands are in the README.

## Before a pull request

```bash
npm run lint
npm test
npm run test:rules
python -m unittest discover -s analytics -p 'test_*.py'
npm run build
```

The Firestore emulator test needs Java. CI runs these same checks without production Firebase credentials. Add a focused test when changing stock calculations, Firestore writes or rules, CSV parsing, or analysis features. Explain any test that cannot be run.

Keep synthetic demo findings labeled as generated, and keep historical UCI estimates separate from live shop data. Update the report and bundled results when the pipeline changes. Do not commit real customer or transaction exports. Deployment to Firebase Hosting is a separate, deliberate step after review; CI only verifies changes.
