import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, getDocs } from "firebase/firestore";
import { adjustStock, createProduct, removeProduct } from "../src/inventory";

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
  it("records every quantity transition and rejects over-selling", async () => {
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
    expect((await getDocs(collection(db, "users/alice/products"))).empty).toBe(
      true,
    );
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
    expect(movements.find((item) => item.kind === "sale")?.quantityAfter).toBe(
      11,
    );
    expect(
      movements.find((item) => item.kind === "deleted")?.quantityBefore,
    ).toBe(8);
  });
});
