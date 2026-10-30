import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let env: RulesTestEnvironment;
const valid = () => ({
  name: "Notebook",
  sku: "NOTE-001",
  category: "Stationery",
  quantity: 10,
  lowStockThreshold: 5,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-stocksync-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => env?.cleanup());

describe("Firestore inventory rules", () => {
  it("requires authentication and isolates each user", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    const bob = env.authenticatedContext("bob").firestore();
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      setDoc(doc(alice, "users/alice/products/one"), valid()),
    );
    await assertSucceeds(getDoc(doc(alice, "users/alice/products/one")));
    await assertFails(getDoc(doc(bob, "users/alice/products/one")));
    await assertFails(
      updateDoc(doc(bob, "users/alice/products/one"), {
        quantity: 2,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(guest, "users/alice/products/one")));
    await assertFails(setDoc(doc(guest, "users/guest/products/one"), valid()));
  });

  it("rejects invalid products and negative stock", async () => {
    const alice = env.authenticatedContext("alice").firestore();
    const ref = doc(alice, "users/alice/products/one");
    await assertFails(setDoc(ref, { ...valid(), quantity: -1 }));
    await assertFails(setDoc(ref, { ...valid(), unexpected: true }));
    await assertSucceeds(setDoc(ref, valid()));
    await assertFails(
      updateDoc(ref, { quantity: -1, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(ref, { quantity: 0, updatedAt: serverTimestamp() }),
    );
    expect((await getDoc(ref)).data()?.quantity).toBe(0);
  });
});
