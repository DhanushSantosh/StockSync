import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  updateDoc,
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
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ProductInput = Pick<
  Product,
  "name" | "sku" | "category" | "lowStockThreshold"
> & { quantity?: number };

export function statusOf(product: Product): "out" | "low" | "healthy" {
  if (product.quantity === 0) return "out";
  return product.quantity <= product.lowStockThreshold ? "low" : "healthy";
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
  if (
    !Number.isSafeInteger(input.lowStockThreshold) ||
    input.lowStockThreshold < 0
  )
    return "Low stock threshold must be a nonnegative whole number.";
  if (
    creating &&
    (!Number.isSafeInteger(input.quantity) || (input.quantity ?? -1) < 0)
  )
    return "Quantity must be a nonnegative whole number.";
  return null;
}

const productsPath = (db: Firestore, uid: string) =>
  collection(db, "users", uid, "products");

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

export async function createProduct(
  db: Firestore,
  uid: string,
  input: ProductInput,
) {
  const error = validateProduct(input, true);
  if (error) throw new Error(error);
  await addDoc(productsPath(db, uid), {
    name: input.name.trim(),
    sku: input.sku.trim(),
    category: input.category.trim(),
    quantity: input.quantity,
    lowStockThreshold: input.lowStockThreshold,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
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
    updatedAt: serverTimestamp(),
  });
}

export async function removeProduct(db: Firestore, uid: string, id: string) {
  await deleteDoc(doc(db, "users", uid, "products", id));
}

export async function adjustStock(
  db: Firestore,
  uid: string,
  id: string,
  delta: number,
) {
  if (!Number.isSafeInteger(delta) || delta === 0)
    throw new Error("Enter a whole number greater than zero.");
  const ref = doc(db, "users", uid, "products", id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This product no longer exists.");
    const current = snapshot.data().quantity;
    const next = current + delta;
    if (!Number.isSafeInteger(next) || next < 0)
      throw new Error("Insufficient stock for this reduction.");
    transaction.update(ref, { quantity: next, updatedAt: serverTimestamp() });
  });
}
