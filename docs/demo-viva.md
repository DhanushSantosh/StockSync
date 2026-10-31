# StockSync demo and viva guide

## Live demonstration

Use a test shop account and two browser windows signed into that account. Keep the [hosted app](https://stocksync-b43cd.web.app/) open in both.

1. In **Products**, add `Demo Notebook` with 10 pieces, alert level 5, and target 20. Show that it appears in the recently updated products list on **Overview**.
2. In **Record → Sale**, sell 6 notebooks. The stock becomes 4, the low-stock warning appears, and **Reorder** suggests 16 units.
3. Show **History**: opening stock and sale have timestamps, before/after quantities, and the signed-in actor.
4. Look at the second window. Its product quantity and dashboard update without refresh through a Firestore snapshot listener.
5. Attempt a deduction larger than the available stock in the product adjustment form. It is rejected. The sale screen has a separate explicit oversell flow that records the real sale amount and leaves stock at zero.
6. Open **Settings** to show the signed-in account and explain staff invites. Use a second account or the Firestore emulator tests to demonstrate that unrelated accounts cannot read the shop's records.

Use the test product only; leave real shop data untouched. Delete the demo product afterward if desired. Its real movement history remains so the stock change can still be explained.

## Likely viva questions

**Why Firebase?** It provides managed Authentication, Firestore, Security Rules, and Hosting without building or operating a separate backend server.

**Where is the data stored?** Product, movement, customer, and shop records are Firestore documents under the owner's user path. Firebase Authentication stores the identity and credentials.

**How do multiple devices stay in sync?** Each signed-in client subscribes with `onSnapshot`. Firestore sends document changes, and React recalculates dashboard values from the current products.

**Why use transactions for stock changes?** A transaction reads the latest quantity and retries if another client changes it before commit. It saves the product and movement together, so two connected sales do not overwrite one another.

**What happens offline?** Cached data remains readable. Relative stock changes can queue as batched increments. Counts, order receipts, and sales beyond recorded stock need a connection. A queued deduction that would create negative stock is rejected by Security Rules when it syncs.

**How is access controlled?** Firebase Authentication identifies the user; Firestore Security Rules enforce owner/staff access and validate document fields. Hiding a button in React alone is not security.

**What does low stock mean?** Quantity greater than zero and less than or equal to the product's alert threshold. Quantity zero is sold out. A reorder suggestion also subtracts units already on order.

**What are the limits?** This is a mini project, not a load-tested commercial system. History records app actions but is not tamper-proof against the owner. Expiry is tracked per product rather than per batch, and offline movement before/after values may be approximate.

## Verification commands

```bash
npm test
npm run test:rules
npm run lint
npm run build
```
