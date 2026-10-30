# StockSync

A real-time inventory app for a single shopkeeper. It helps answer three daily questions: what is on hand, what needs reordering, and why did the count change?

## What it does

- Add and edit products with SKU, category, supplier, low-stock alert level, and restock target.
- Record receipts, sales, damaged/lost units, and physical stock counts. Firestore transactions keep the quantity and movement record together, and reject negative stock.
- Show a live reorder list with suggested quantities, supplier details, copyable text, and CSV download.
- Browse, search, filter, and export recent stock movements, including before/after quantities and optional notes.
- See live dashboard totals and stock alerts on multiple signed-in devices. Firebase Authentication also provides password-reset email.

## What is stored in Firebase

Firebase Authentication stores account credentials. Cloud Firestore stores product documents at `users/{uid}/products/{productId}` and time-stamped movement documents at `users/{uid}/movements/{movementId}`. Firestore Security Rules restrict both collections to their account. Standard Firebase Hosting can serve the built web app.

Movement records are write-once through the client rules and remain after a product is deleted. They record actions made in this app; they are not a tamper-proof audit log against a user who controls their own Firebase client. Changes made before this feature was added cannot be reconstructed. The Activity screen loads the latest 50 movements and exports the currently displayed set.

## Stack

React, TypeScript, Vite, Tailwind CSS, Firebase Authentication, Cloud Firestore, and Firebase Hosting. No custom server is required.

## Firebase setup

1. Create a project in the [Firebase Console](https://console.firebase.google.com/). The Spark plan is enough for this mini-project. Analytics is optional.
2. In **Project overview**, choose the **Web** icon to register a web app. Copy the web app configuration from **Project settings → Your apps**.
3. In **Authentication → Sign-in method**, enable **Email/Password**. For local development, add `localhost` under **Authentication → Settings → Authorized domains** if it is not listed.
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

Register an account, add a product with a restock target, and open StockSync in a second browser window with the same account. Record a sale in one window; the other window, dashboard, Activity, and Reorder screens update automatically. Try reducing more units than available to see the transaction reject a negative quantity. Sign in with another account to confirm that inventories are separate.

## Scope

One account represents one shopkeeper and one inventory. Staff roles, shared inventories, product photos, payments, and forecasting are outside this mini-project. Stock transactions require a network connection; offline changes are not queued. Cloud Storage and Cloud Functions require billing on the current Firebase Spark plan, so this app does not depend on them.
