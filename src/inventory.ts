import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
} from "firebase/firestore";

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  lowStockThreshold: number;
  targetStock?: number;
  supplier?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProductInput = Pick<
  Product,
  "name" | "sku" | "category" | "lowStockThreshold"
> & {
  quantity?: number;
  targetStock: number;
  supplier: string;
};

export type MovementKind =
  "opening" | "restock" | "sale" | "damage" | "correction" | "deleted";
export type Movement = {
  id: string;
  productId: string;
  productName: string;
  kind: MovementKind;
  change: number;
  quantityBefore: number;
  quantityAfter: number;
  note: string;
  createdAt?: Timestamp;
};

export type StockAction = {
  kind: "restock" | "sale" | "damage" | "correction";
  amount: number;
  note: string;
};

export const movementLabels: Record<MovementKind, string> = {
  opening: "Opening stock",
  restock: "Restocked",
  sale: "Sold",
  damage: "Damaged / lost",
  correction: "Stock count",
  deleted: "Product deleted",
};

export function statusOf(product: Product): "out" | "low" | "healthy" {
  if (product.quantity === 0) return "out";
  return product.quantity <= product.lowStockThreshold ? "low" : "healthy";
}

export function suggestedReorder(product: Product): number | null {
  if (statusOf(product) === "healthy") return null;
  if (!product.targetStock || product.targetStock <= product.quantity)
    return null;
  return product.targetStock - product.quantity;
}

export function inventorySummary(products: Product[]) {
  return {
    products: products.length,
    units: products.reduce((sum, product) => sum + product.quantity, 0),
    low: products.filter((product) => statusOf(product) === "low").length,
    out: products.filter((product) => statusOf(product) === "out").length,
  };
}

export function validateProduct(
  input: ProductInput,
  creating: boolean,
): string | null {
  if (!input.name.trim() || input.name.trim().length > 100)
    return "Name must be 1–100 characters.";
  if (!input.category.trim() || input.category.trim().length > 60)
    return "Category must be 1–60 characters.";
  if (input.sku.trim().length > 60) return "SKU must be at most 60 characters.";
  if (input.supplier.trim().length > 100)
    return "Supplier must be at most 100 characters.";
  if (
    !Number.isSafeInteger(input.lowStockThreshold) ||
    input.lowStockThreshold < 0
  )
    return "Low stock threshold must be a nonnegative whole number.";
  if (!Number.isSafeInteger(input.targetStock) || input.targetStock < 0)
    return "Restock target must be a nonnegative whole number.";
  if (input.targetStock > 0 && input.targetStock <= input.lowStockThreshold)
    return "Restock target must be above the low-stock alert level.";
  if (
    creating &&
    (!Number.isSafeInteger(input.quantity) || (input.quantity ?? -1) < 0)
  )
    return "Quantity must be a nonnegative whole number.";
  return null;
}

const productsPath = (db: Firestore, uid: string) =>
  collection(db, "users", uid, "products");
const movementsPath = (db: Firestore, uid: string) =>
  collection(db, "users", uid, "movements");

export function subscribeToProducts(
  db: Firestore,
  uid: string,
  onData: (products: Product[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    productsPath(db, uid),
    (snapshot) => {
      const products = snapshot.docs.map(
        (item) => ({ id: item.id, ...item.data() }) as Product,
      );
      products.sort(
        (a, b) =>
          (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0),
      );
      onData(products);
    },
    (error) => onError(error.message),
  );
}

export function subscribeToMovements(
  db: Firestore,
  uid: string,
  onData: (movements: Movement[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(movementsPath(db, uid), orderBy("createdAt", "desc"), limit(50)),
    (snapshot) => {
      onData(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as Movement,
        ),
      );
    },
    (error) => onError(error.message),
  );
}

export async function createProduct(
  db: Firestore,
  uid: string,
  input: ProductInput,
) {
  const error = validateProduct(input, true);
  if (error) throw new Error(error);
  const productRef = doc(productsPath(db, uid));
  const movementRef = doc(movementsPath(db, uid));
  const batch = writeBatch(db);
  batch.set(productRef, {
    name: input.name.trim(),
    sku: input.sku.trim(),
    category: input.category.trim(),
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    targetStock: input.targetStock,
    supplier: input.supplier.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(movementRef, {
    productId: productRef.id,
    productName: input.name.trim(),
    kind: "opening",
    change: input.quantity,
    quantityBefore: 0,
    quantityAfter: input.quantity,
    note: "Initial stock",
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function editProduct(
  db: Firestore,
  uid: string,
  id: string,
  input: ProductInput,
) {
  const error = validateProduct(input, false);
  if (error) throw new Error(error);
  await updateDoc(doc(db, "users", uid, "products", id), {
    name: input.name.trim(),
    sku: input.sku.trim(),
    category: input.category.trim(),
    lowStockThreshold: input.lowStockThreshold,
    targetStock: input.targetStock,
    supplier: input.supplier.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function removeProduct(db: Firestore, uid: string, id: string) {
  const ref = doc(db, "users", uid, "products", id);
  const movementRef = doc(movementsPath(db, uid));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This product no longer exists.");
    const product = snapshot.data();
    transaction.delete(ref);
    transaction.set(movementRef, {
      productId: id,
      productName: product.name,
      kind: "deleted",
      // Not -quantity: -0 is stored as a double and fails the int rule.
      change: 0 - product.quantity,
      quantityBefore: product.quantity,
      quantityAfter: 0,
      note: "Product removed",
      createdAt: serverTimestamp(),
    });
  });
}

export async function adjustStock(
  db: Firestore,
  uid: string,
  id: string,
  action: StockAction,
) {
  const { kind, amount } = action;
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    (kind !== "correction" && amount === 0)
  )
    throw new Error("Enter a valid whole-number quantity.");
  const note = action.note.trim();
  if (note.length > 200)
    throw new Error("Note must be at most 200 characters.");
  const ref = doc(db, "users", uid, "products", id);
  const movementRef = doc(movementsPath(db, uid));
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This product no longer exists.");
    const product = snapshot.data();
    const current = product.quantity as number;
    const next =
      kind === "correction"
        ? amount
        : kind === "restock"
          ? current + amount
          : current - amount;
    if (!Number.isSafeInteger(next) || next < 0)
      throw new Error("Insufficient stock for this reduction.");
    if (next === current)
      throw new Error("The stock count is already correct.");
    transaction.update(ref, { quantity: next, updatedAt: serverTimestamp() });
    transaction.set(movementRef, {
      productId: id,
      productName: product.name,
      kind,
      change: next - current,
      quantityBefore: current,
      quantityAfter: next,
      note,
      createdAt: serverTimestamp(),
    });
  });
}
