import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  disableNetwork,
  enableNetwork,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  waitForPendingWrites,
} from "firebase/firestore";
import {
  adjustStock,
  createProduct,
  createProducts,
  recordStockChanges,
  fetchAllMovements,
  removeProduct,
  undoMovement,
  type Product,
} from "../src/inventory";

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-stocksync-services",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => env?.cleanup());

describe("stock movement workflow", () => {
  it(
    "records every quantity transition and rejects over-selling",
    { timeout: 20000 },
    async () => {
      const db = env.authenticatedContext("alice").firestore();
      await createProduct(db, "alice", {
        name: "Notebook",
        sku: "N-1",
        category: "Stationery",
        quantity: 10,
        lowStockThreshold: 3,
        targetStock: 20,
        supplier: "Supplier",
      });
      const productDocs = await getDocs(collection(db, "users/alice/products"));
      const id = productDocs.docs[0].id;
      await adjustStock(db, "alice", id, {
        kind: "restock",
        amount: 5,
        note: "Invoice 123",
      });
      await adjustStock(db, "alice", id, {
        kind: "sale",
        amount: 4,
        note: "Counter sale",
      });
      await adjustStock(db, "alice", id, {
        kind: "damage",
        amount: 1,
        note: "Broken",
      });
      await expect(
        adjustStock(db, "alice", id, { kind: "sale", amount: 11, note: "" }),
      ).rejects.toThrow(/Insufficient stock/);
      await adjustStock(db, "alice", id, {
        kind: "correction",
        amount: 8,
        note: "Stocktake",
      });
      expect(
        (await getDocs(collection(db, "users/alice/products"))).docs[0].data()
          .quantity,
      ).toBe(8);
      await removeProduct(db, "alice", id);
      expect(
        (await getDocs(collection(db, "users/alice/products"))).empty,
      ).toBe(true);
      const movements = (
        await getDocs(collection(db, "users/alice/movements"))
      ).docs.map((item) => item.data());
      expect(movements).toHaveLength(6);
      expect(movements.map((item) => item.kind).sort()).toEqual([
        "correction",
        "damage",
        "deleted",
        "opening",
        "restock",
        "sale",
      ]);
      expect(
        movements.find((item) => item.kind === "sale")?.quantityAfter,
      ).toBe(11);
      expect(
        movements.find((item) => item.kind === "deleted")?.quantityBefore,
      ).toBe(8);
    },
  );

  it("deletes an out-of-stock product and records a zero change", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await createProduct(db, "alice", {
      name: "Notebook",
      sku: "N-1",
      category: "Stationery",
      quantity: 0,
      lowStockThreshold: 3,
      targetStock: 20,
      supplier: "Supplier",
    });
    const productDocs = await getDocs(collection(db, "users/alice/products"));
    await removeProduct(db, "alice", productDocs.docs[0].id);
    expect((await getDocs(collection(db, "users/alice/products"))).empty).toBe(
      true,
    );
    const movements = (
      await getDocs(collection(db, "users/alice/movements"))
    ).docs.map((item) => item.data());
    expect(movements.find((item) => item.kind === "deleted")?.change).toBe(0);
  });

  const shelf = {
    sku: "",
    category: "Stationery",
    lowStockThreshold: 3,
    targetStock: 20,
    supplier: "",
  };
  const listProducts = async (db: Parameters<typeof collection>[0]) =>
    (await getDocs(collection(db, "users/alice/products"))).docs.map(
      (item) => ({ id: item.id, ...item.data() }) as Product,
    );

  it("records a multi-item sale as one change per product", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await createProducts(db, "alice", [
      { ...shelf, name: "Pen", quantity: 10 },
      { ...shelf, name: "Book", quantity: 4 },
    ]);
    const [first, second] = await listProducts(db);
    await recordStockChanges(db, "alice", [
      { product: first, action: { kind: "sale", amount: 2, note: "Bill" } },
      { product: second, action: { kind: "sale", amount: 1, note: "Bill" } },
    ]);
    const after = await listProducts(db);
    expect(after.map((item) => item.quantity).sort()).toEqual(
      [first.quantity - 2, second.quantity - 1].sort(),
    );
    const sales = (
      await getDocs(collection(db, "users/alice/movements"))
    ).docs.filter((item) => item.data().kind === "sale");
    expect(sales).toHaveLength(2);
  });

  it("rejects the whole sale when one line exceeds stock", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await createProducts(db, "alice", [
      { ...shelf, name: "Pen", quantity: 1 },
      { ...shelf, name: "Book", quantity: 5 },
    ]);
    const products = await listProducts(db);
    await expect(
      recordStockChanges(
        db,
        "alice",
        products.map((product) => ({
          product,
          action: { kind: "sale" as const, amount: 2, note: "" },
        })),
      ),
    ).rejects.toThrow(/Pen/);
    expect(
      (await listProducts(db)).map((item) => item.quantity).sort(),
    ).toEqual([1, 5]);
  });

  it("imports more products than fit in one write batch", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await createProducts(
      db,
      "alice",
      Array.from({ length: 260 }, (_, index) => ({
        ...shelf,
        name: `Item ${index}`,
        quantity: 1,
      })),
    );
    await waitForPendingWrites(db);
    expect(await listProducts(db)).toHaveLength(260);
  }, 20000);

  it("queues a stock change offline and syncs it on reconnect", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await createProduct(db, "alice", {
      ...shelf,
      name: "Pen",
      quantity: 10,
    });
    const [product] = await listProducts(db);
    // The app's live listener is what keeps products in the offline cache.
    const stop = onSnapshot(collection(db, "users/alice/products"), () => {});
    await getDocs(collection(db, "users/alice/products"));
    await disableNetwork(db);
    const result = await adjustStock(db, "alice", product.id, {
      kind: "sale",
      amount: 3,
      note: "",
    });
    expect(result).toBe("queued");
    const cached = await getDocsFromCache(
      collection(db, "users/alice/products"),
    );
    expect(cached.docs[0].data().quantity).toBe(7);
    await enableNetwork(db);
    await waitForPendingWrites(db);
    expect((await listProducts(db))[0].quantity).toBe(7);
    stop();
  }, 15000);

  const oneProduct = async (db: Parameters<typeof collection>[0]) => {
    await createProduct(db, "alice", { ...shelf, name: "Pen", quantity: 10 });
    return (await listProducts(db))[0];
  };

  it("adds a customer return back to stock as its own kind", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const product = await oneProduct(db);
    await adjustStock(db, "alice", product.id, {
      kind: "return",
      amount: 2,
      note: "Wrong size",
    });
    expect((await listProducts(db))[0].quantity).toBe(12);
    const history = await fetchAllMovements(db, "alice");
    expect(history.find((item) => item.kind === "return")?.change).toBe(2);
  });

  it("undoes a change once and refuses a second undo", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const product = await oneProduct(db);
    await adjustStock(db, "alice", product.id, {
      kind: "sale",
      amount: 4,
      note: "",
    });
    const sale = (await fetchAllMovements(db, "alice")).find(
      (item) => item.kind === "sale",
    )!;
    await undoMovement(db, "alice", sale);
    expect((await listProducts(db))[0].quantity).toBe(10);
    const undo = (await fetchAllMovements(db, "alice")).find(
      (item) => item.kind === "undo",
    );
    expect(undo).toMatchObject({ undoes: sale.id, change: 4 });
    await expect(undoMovement(db, "alice", sale)).rejects.toThrow();
    expect((await listProducts(db))[0].quantity).toBe(10);
  });

  it("refuses an undo that would take stock below zero", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const product = await oneProduct(db);
    await adjustStock(db, "alice", product.id, {
      kind: "restock",
      amount: 5,
      note: "",
    });
    await adjustStock(db, "alice", product.id, {
      kind: "sale",
      amount: 14,
      note: "",
    });
    const restock = (await fetchAllMovements(db, "alice")).find(
      (item) => item.kind === "restock",
    )!;
    await expect(undoMovement(db, "alice", restock)).rejects.toThrow(/below/);
  });

  it("records an oversell by taking stock to zero with a note", async () => {
    const db = env.authenticatedContext("alice").firestore();
    const product = await oneProduct(db);
    await recordStockChanges(db, "alice", [
      {
        product,
        action: { kind: "sale", amount: 13, note: "", clampAtZero: true },
      },
    ]);
    expect((await listProducts(db))[0].quantity).toBe(0);
    const sale = (await fetchAllMovements(db, "alice")).find(
      (item) => item.kind === "sale",
    );
    expect(sale).toMatchObject({ change: -10, quantityAfter: 0 });
    expect(sale?.note).toMatch(/13 sold with 10 on hand/);
  });

  it("reads history past the first 50 changes", async () => {
    const db = env.authenticatedContext("alice").firestore();
    await createProducts(
      db,
      "alice",
      Array.from({ length: 60 }, (_, index) => ({
        ...shelf,
        name: `Item ${index}`,
        quantity: 1,
      })),
    );
    await waitForPendingWrites(db);
    expect(await fetchAllMovements(db, "alice")).toHaveLength(60);
  }, 20000);
});
