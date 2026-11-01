# StockSync

A real-time inventory app for a single shopkeeper. It helps answer three daily questions: what is on hand, what needs reordering, and why did the count change?

## What it does

- Add and edit products with SKU, category, supplier, low-stock alert level, and restock target, or import them from a CSV file.
- Record receipts, sales, damaged/lost units, and physical stock counts. Record customer returns, and sales larger than the recorded count, which take stock to zero and note the real amount. Record a multi-item sale at once, or count the shelves at the end of the day and record what is missing as sold. Connected stock changes use Firestore transactions to read the current quantity and save the quantity and movement together. Security Rules reject negative stock.
- Queue relative stock changes while offline and sync them on reconnect; the app can be installed on a phone. Physical counts, deliveries against an open order, and sales beyond the recorded count need a connection so they cannot overwrite newer stock.
- Show a live reorder list with suggested quantities, supplier details, copyable text, and CSV download. Mark orders as placed and received, so stock already on the way is not ordered twice.
- Sell loose goods by kilogram or litre, receive stock by the carton, and see products nearing their expiry date.
- Find products by SKU or barcode, with a USB scanner or the phone camera.
- Give staff their own login with an invite code. Staff record stock but cannot change products or prices, and History shows who made each change.
- Track what customers owe, on a sale or by hand, and record their payments.
- Use the app in English or Hindi.
- Sign in with Google, or with email and a verified address. Security Rules keep unverified accounts out. Sign-out waits for pending changes and clears Firestore's browser cache; if clearing fails, the app asks you to close other StockSync tabs and retry. Settings can permanently delete an account and its shop data.
- Track cost and selling prices in rupees for stock value, sales, and profit. Each sale keeps the amounts from when it happened.
- Browse, search, filter, and export recent stock changes, including before/after quantities and optional notes.
- See live stock totals, a 14-day chart, and stock alerts on multiple signed-in devices. Firebase Authentication also provides password-reset email.

## What is stored in Firebase

Firebase Authentication stores account credentials. Cloud Firestore stores products at `users/{uid}/products/{productId}`, time-stamped movements at `users/{uid}/movements/{movementId}`, customer balances and credit entries, shop profiles, and staff membership records. Firestore Security Rules restrict access to the owner and authorized staff. Firebase Hosting serves the built web app.

Movement records are write-once through the client rules and remain after a product is deleted. They record actions made in this app; they are not a tamper-proof audit log against a user who controls their own Firebase client. Changes made before this feature was added cannot be reconstructed. The History screen loads 50 movements at a time and exports the full history for the current filters. A change can be undone once, which records a reversing movement rather than editing the original. The Overview chart reads the last 14 days of movements, up to 2,000.

## Stack

React, TypeScript, Vite, Tailwind CSS, Firebase Authentication, Cloud Firestore, and Firebase Hosting. No custom server is required.

## Firebase setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/). The Spark plan is enough for this mini-project. Analytics is optional.
2. In **Project overview**, choose the **Web** icon to register a web app. Copy the web app configuration from **Project settings → Your apps**.
3. In **Authentication → Sign-in method**, enable **Email/Password** and **Google**. For the hosted app, add `https://YOUR_PROJECT.web.app/__/auth/handler` to the OAuth client's authorized redirect URIs in Google Cloud Console. For local development, add `localhost` under **Authentication → Settings → Authorized domains** if it is not listed.
4. In **Firestore Database**, create the default database. Choose **production mode** and a suitable region. Its initial deny-all rules will be replaced by this repository's tested rules in step 7.
5. Copy `.env.example` to `.env` and fill in `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` from the web app configuration. Do not add quotation marks. `.env` is ignored by Git.
6. Run `npm install` and `npm run dev`, then open the local URL shown by Vite.
7. Sign in to the Firebase CLI with `npx firebase login`, then deploy the access rules with `npx firebase deploy --project YOUR_PROJECT_ID --only firestore:rules`. Do this before adding products.

The web app config connects the browser to Firebase. Access to products and movements is enforced by `firestore.rules`.

## Verify

```bash
npm test
npm run test:rules
npm run lint
npm run build
```

`test:rules` starts the local Firestore emulator and needs Java. It does not touch your Firebase project.

For a full local demo without a Firebase project, create a temporary `.env.local`:

```env
VITE_FIREBASE_API_KEY=demo-key
VITE_FIREBASE_AUTH_DOMAIN=demo-stocksync.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-stocksync
VITE_FIREBASE_APP_ID=1:123456789:web:demo
VITE_USE_FIREBASE_EMULATORS=true
```

Run `npx firebase emulators:start --project demo-stocksync --only auth,firestore`, then `npm run dev` in another terminal. Never use emulator mode with real accounts. Remove `.env.local` before connecting a real Firebase project.

## Deploy

After testing with your Firebase project:

```bash
npm run build
npx firebase deploy --project YOUR_PROJECT_ID --only firestore:rules,hosting
```

Firebase Hosting serves the `dist` folder and rewrites routes to `index.html`. Build with the same `.env` values as the Firebase project you deploy to.

## Demo

Register an account, add a product with a restock target, and open StockSync in a second browser window with the same account. Record a sale in one window; the other window, the Overview, Products, Reorder, and History screens update automatically. A normal stock deduction cannot take stock below zero; the explicit oversell option records the full sale and leaves stock at zero. Sign in with another account to confirm that inventories are separate.

## SDA extension: Retail Insights

The Overview links to a separate Retail Insights page. It displays a historical demand-prediction experiment using UCI Online Retail II; the dataset's UK giftware products do **not** match this shop's inventory, and its predictions are not live shop forecasts. The Python model runs locally during preparation; the website bundles only a small derived JSON file. No raw transactions are written to Firestore.

The [SDA report](docs/sda/report.md) documents the cleaning, chronological evaluation, actual metrics, figures, limitations, and reproduction steps. Its [PDF](output/pdf/StockSync-SDA-Report.pdf) is a separate submission artifact from the CC report. To rebuild the data, download the workbook from the [UCI source](https://archive.ics.uci.edu/dataset/502/online+retail+ii), install `analytics/requirements.txt` in a Python environment, then run `python analytics/build.py --input /path/to/online_retail_II.xlsx` followed by `python analytics/render_report.py`. The raw workbook belongs outside this repository.

## Scope

One account owns one inventory, and staff join it by invite code. Product photos, card payments, and live shop forecasting are outside this mini-project. Expiry is one date per product rather than per batch. Connected stock changes read the latest quantity in a transaction. Offline queued changes use relative increments; their History before/after values may be approximate if another device changes stock before they sync. Offline changes are timestamped when they sync, not when they were made. This app does not depend on Cloud Storage or Cloud Functions.

## Project submission

The [project report](docs/project-report.md) and its [PDF](output/pdf/StockSync-Project-Report.pdf) explain the problem, architecture, logic, security, tests, and limitations. The [demo and viva guide](docs/demo-viva.md) gives a repeatable presentation flow and likely questions.
