# StockSync

A small, real-time inventory app for a single shopkeeper. Each account has its own products. The app supports product management, stock adjustments, low-stock alerts, a live dashboard, and responsive layouts.

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

The web app config connects the browser to Firebase. Access to products is enforced by `firestore.rules`, with each account limited to `users/{uid}/products`.

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

Register an account, add a product, and open StockSync in a second browser window with the same account. Adjust stock in one window; the other window and dashboard update automatically. Try reducing more units than available to see the transaction reject a negative quantity. Sign in with another account to confirm that inventories are separate.

## Scope

One account represents one shopkeeper and one inventory. Staff roles, shared inventories, product photos, payments, and forecasting are outside this mini-project.
