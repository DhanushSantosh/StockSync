## Change

Describe the user-facing behavior or analysis change.

## Checks

- [ ] `npm run lint && npm test && npm run test:rules && npm run build`
- [ ] `python -m unittest discover -s analytics -p 'test_*.py'` (if analytics changed)
- [ ] Updated docs, generated JSON/CSV, and report figures where relevant

## Data and deployment

- [ ] No private shop data, credentials, or raw UCI workbook included
- [ ] Any Firebase Rules change was tested with the emulator
