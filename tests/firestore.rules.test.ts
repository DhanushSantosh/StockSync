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
  deleteDoc,
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
const movement = () => ({
  productId: "one",
  productName: "Notebook",
  kind: "sale",
  change: -2,
  quantityBefore: 10,
  quantityAfter: 8,
  note: "Customer sale",
  createdAt: serverTimestamp(),
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
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    const bob = env
      .authenticatedContext("bob", { email_verified: true })
      .firestore();
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
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
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

  it("accepts reorder fields and protects immutable movement history", async () => {
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    const bob = env
      .authenticatedContext("bob", { email_verified: true })
      .firestore();
    const guest = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      setDoc(doc(alice, "users/alice/products/one"), {
        ...valid(),
        targetStock: 20,
        supplier: "Local wholesaler",
      }),
    );
    await assertFails(
      setDoc(doc(alice, "users/alice/products/bad"), {
        ...valid(),
        targetStock: 3,
      }),
    );
    const ref = doc(alice, "users/alice/movements/change1");
    await assertSucceeds(setDoc(ref, movement()));
    await assertSucceeds(getDoc(ref));
    await assertFails(getDoc(doc(bob, "users/alice/movements/change1")));
    await assertFails(getDoc(doc(guest, "users/alice/movements/change1")));
    await assertFails(
      setDoc(doc(bob, "users/alice/movements/change2"), movement()),
    );
    await assertFails(
      setDoc(doc(alice, "users/alice/movements/bad"), {
        ...movement(),
        quantityAfter: -1,
      }),
    );
    await assertFails(updateDoc(ref, { note: "rewritten" }));
    await assertFails(deleteDoc(ref));
  });

  it("accepts returns and one undo per movement, nothing else", async () => {
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    await assertSucceeds(
      setDoc(doc(alice, "users/alice/movements/r1"), {
        ...movement(),
        kind: "return",
        change: 2,
        quantityAfter: 12,
      }),
    );
    const undo = {
      ...movement(),
      kind: "undo",
      change: 2,
      quantityAfter: 12,
      undoes: "r1",
    };
    const ref = doc(alice, "users/alice/movements/undo-r1");
    await assertFails(setDoc(ref, { ...undo, undoes: 7 }));
    await assertFails(setDoc(doc(alice, "users/alice/movements/u2"), undo));
    const { undoes: _dropped, ...withoutTarget } = undo;
    await assertFails(setDoc(ref, withoutTarget));
    await assertSucceeds(setDoc(ref, undo));
    await assertFails(setDoc(ref, undo));
  });

  it("keeps prices and order counts as whole nonnegative numbers", async () => {
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    const ref = doc(alice, "users/alice/products/priced");
    await assertFails(setDoc(ref, { ...valid(), costPrice: -1 }));
    await assertFails(setDoc(ref, { ...valid(), sellPrice: 1.5 }));
    await assertFails(setDoc(ref, { ...valid(), onOrder: -2 }));
    await assertSucceeds(
      setDoc(ref, { ...valid(), costPrice: 800, sellPrice: 1000, onOrder: 5 }),
    );
    await assertFails(
      setDoc(doc(alice, "users/alice/movements/bad-money"), {
        ...movement(),
        revenue: 1.5,
      }),
    );
    await assertSucceeds(
      setDoc(doc(alice, "users/alice/movements/good-money"), {
        ...movement(),
        revenue: -500,
        profit: -100,
      }),
    );
  });

  it("accepts weights, units, pack sizes and expiry dates", async () => {
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    const ref = doc(alice, "users/alice/products/rice");
    await assertFails(setDoc(ref, { ...valid(), unit: "bags" }));
    await assertFails(setDoc(ref, { ...valid(), packSize: 0 }));
    await assertFails(setDoc(ref, { ...valid(), expiryDate: 20270115 }));
    await assertSucceeds(
      setDoc(ref, {
        ...valid(),
        quantity: 2.5,
        unit: "kg",
        packSize: 25,
        expiryDate: "2027-01-15",
      }),
    );
    await assertSucceeds(
      setDoc(doc(alice, "users/alice/movements/kg1"), {
        ...movement(),
        change: -0.3,
        quantityBefore: 1,
        quantityAfter: 0.7,
      }),
    );
    await assertFails(
      setDoc(doc(alice, "users/alice/movements/kg2"), {
        ...movement(),
        change: -0.3,
        quantityBefore: 1,
        quantityAfter: 0.5,
      }),
    );
  });

  describe("shared shops", () => {
    const bobEmail = "bob@shop.test";
    const owner = () =>
      env.authenticatedContext("alice", { email_verified: true }).firestore();
    const staff = () =>
      env
        .authenticatedContext("bob", { email: bobEmail, email_verified: true })
        .firestore();
    const join = async () => {
      await assertSucceeds(
        setDoc(doc(owner(), "shopInvites/CODE1234"), { owner: "alice" }),
      );
      const bob = staff();
      await assertSucceeds(getDoc(doc(bob, "shopInvites/CODE1234")));
      await assertSucceeds(
        setDoc(doc(bob, "users/alice/members/bob"), {
          email: bobEmail,
          code: "CODE1234",
        }),
      );
      await assertSucceeds(
        setDoc(doc(bob, "memberships/bob"), { owner: "alice" }),
      );
      await assertSucceeds(
        setDoc(doc(owner(), "users/alice/products/one"), valid()),
      );
      return bob;
    };

    it("needs a real invite to join", async () => {
      await assertFails(
        setDoc(doc(staff(), "users/alice/members/bob"), {
          email: bobEmail,
          code: "NOPE",
        }),
      );
      await assertFails(getDoc(doc(staff(), "users/alice/products/one")));
    });

    it("lets staff sell but not change the catalog", async () => {
      const bob = await join();
      const ref = doc(bob, "users/alice/products/one");
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(
        updateDoc(ref, { quantity: 9, updatedAt: serverTimestamp() }),
      );
      await assertFails(
        updateDoc(ref, { sellPrice: 1, updatedAt: serverTimestamp() }),
      );
      await assertFails(deleteDoc(ref));
      await assertFails(setDoc(doc(bob, "users/alice/products/new"), valid()));
      await assertSucceeds(
        setDoc(doc(bob, "users/alice/movements/s1"), {
          ...movement(),
          by: bobEmail,
        }),
      );
      await assertFails(
        setDoc(doc(bob, "users/alice/movements/s2"), {
          ...movement(),
          by: "someone@else.test",
        }),
      );
    });

    it("cuts off removed staff", async () => {
      const bob = await join();
      await assertSucceeds(deleteDoc(doc(owner(), "users/alice/members/bob")));
      await assertFails(getDoc(doc(bob, "users/alice/products/one")));
    });

    it("keeps other people out of the invite list and members", async () => {
      await join();
      const carol = env
        .authenticatedContext("carol", { email_verified: true })
        .firestore();
      await assertFails(getDoc(doc(carol, "users/alice/members/bob")));
      await assertFails(deleteDoc(doc(carol, "shopInvites/CODE1234")));
      await assertFails(
        setDoc(doc(carol, "shopInvites/FAKE"), { owner: "alice" }),
      );
    });
  });

  it("keeps customer credit whole and its entries permanent", async () => {
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    const customer = doc(alice, "users/alice/customers/c1");
    await assertFails(
      setDoc(customer, {
        name: "",
        phone: "",
        balance: 0,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      setDoc(customer, {
        name: "Ravi",
        phone: "",
        balance: 500,
        updatedAt: serverTimestamp(),
      }),
    );
    const entry = doc(alice, "users/alice/creditEntries/e1");
    const record = {
      customerId: "c1",
      customerName: "Ravi",
      amount: 500,
      note: "",
      createdAt: serverTimestamp(),
    };
    await assertFails(setDoc(entry, { ...record, amount: 1.5 }));
    await assertSucceeds(setDoc(entry, record));
    await assertFails(updateDoc(entry, { amount: 1 }));
    await assertFails(deleteDoc(entry));
  });

  it("keeps unverified accounts out of everything", async () => {
    const unverified = env
      .authenticatedContext("mallory", { email: "owner@shop.test" })
      .firestore();
    await assertFails(
      setDoc(doc(unverified, "users/mallory/products/one"), valid()),
    );
    await assertFails(getDoc(doc(unverified, "users/mallory/products/one")));
    await assertFails(
      setDoc(doc(unverified, "shopInvites/ABCD2345"), { owner: "mallory" }),
    );
  });

  it("makes staff sign their changes with their real email", async () => {
    const owner = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    await setDoc(doc(owner, "shopInvites/CODE1234"), { owner: "alice" });
    const email = "bob@shop.test";
    const bob = env
      .authenticatedContext("bob", { email, email_verified: true })
      .firestore();
    await assertFails(
      setDoc(doc(bob, "users/alice/members/bob"), {
        email: "owner@shop.test",
        code: "CODE1234",
      }),
    );
    await assertSucceeds(
      setDoc(doc(bob, "users/alice/members/bob"), { email, code: "CODE1234" }),
    );
    await assertFails(
      setDoc(doc(bob, "users/alice/movements/hidden"), movement()),
    );
    await assertSucceeds(
      setDoc(doc(bob, "users/alice/movements/signed"), {
        ...movement(),
        by: email,
      }),
    );
  });

  it("only lets history go once its owner starts closing the account", async () => {
    const alice = env
      .authenticatedContext("alice", { email_verified: true })
      .firestore();
    const ref = doc(alice, "users/alice/movements/m1");
    await assertSucceeds(setDoc(ref, movement()));
    await assertFails(deleteDoc(ref));
    const closing = doc(alice, "users/alice/closing/request");
    const carol = env
      .authenticatedContext("carol", { email_verified: true })
      .firestore();
    await assertFails(setDoc(doc(carol, "users/alice/closing/request"), {}));
    await assertSucceeds(setDoc(closing, {}));
    await assertFails(deleteDoc(doc(carol, "users/alice/movements/m1")));
    await assertSucceeds(deleteDoc(ref));
    await assertSucceeds(deleteDoc(closing));
  });
});
