import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  clearIndexedDbPersistence,
  terminate,
  waitForPendingWrites,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { deleteAccountData } from "./shop";

// A failed cache clear must block sign-out rather than silently leave shop
// data behind. Firestore must be restarted with a page refresh after failure.
async function clearLocalData() {
  if (!db) return;
  await terminate(db);
  try {
    await clearIndexedDbPersistence(db);
  } catch {
    throw new Error(
      "Could not clear this device's saved data. Close other StockSync tabs, refresh this page, then try again.",
    );
  }
}

// Unsynced changes would be lost, so they block sign-out.
export async function signOutOfDevice() {
  if (!auth) return;
  if (db) {
    const synced = await Promise.race([
      waitForPendingWrites(db).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(resolve, 5000, false)),
    ]);
    if (!synced)
      throw new Error(
        "You have changes waiting to sync. Connect to the internet, then sign out.",
      );
  }
  await clearLocalData();
  await signOut(auth);
  location.reload();
}

const recentSignIn = 5 * 60 * 1000;
const wasRecent = (user: User) =>
  Date.now() - new Date(user.metadata.lastSignInTime ?? 0).getTime() <
  recentSignIn;
const signsInWithPassword = (user: User) =>
  user.providerData.some((item) => item.providerId === "password");

// Popups can't return to an installed app, so a fresh sign-in stands in there.
async function confirmIdentity(user: User, password: string) {
  if (signsInWithPassword(user)) {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email ?? "", password),
    );
  } else if (!wasRecent(user)) {
    if (window.matchMedia("(display-mode: standalone)").matches)
      throw new Error(
        "For your security, sign out and sign in again, then delete your account.",
      );
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  }
}

export const needsPassword = () =>
  !!auth?.currentUser && signsInWithPassword(auth.currentUser);

export async function deleteAccount(password: string, shop: string) {
  const user = auth?.currentUser;
  if (!db || !auth || !user) return;
  if (navigator.onLine === false)
    throw new Error("Connect to the internet to delete your account.");
  // Before touching any data, so a wrong password deletes nothing.
  await confirmIdentity(user, password);
  await deleteAccountData(db, user.uid, shop === user.uid ? null : shop);
  await clearLocalData();
  await deleteUser(user);
  location.reload();
}
