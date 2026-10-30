import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Timestamp,
  type WriteBatch,
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

// What a full shelf holds: sets a product's tile size and fill level.
export function shelfCapacity(product: Product): number {
  return Math.max(
    product.targetStock ?? 0,
    product.quantity,
    product.lowStockThreshold * 2,
    1,
  );
}

export function inventorySummary(products: Product[]) {
  return {
    products: products.length,
    units: products.reduce((sum, product) => sum + product.quantity, 0),
    low: products.filter((product) => statusOf(product) === "low").length,
    out: products.filter((product) => statusOf(product) === "out").length,
  };
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const movedAt = (movement: Pick<Movement, "createdAt">, now: Date) =>
  movement.createdAt?.toDate() ?? now;

// Closing total for each of the last `days` days, oldest first.
export function unitsByDay(
  movements: Pick<Movement, "change" | "createdAt">[],
  currentUnits: number,
  days: number,
  now: Date,
) {
  const today = startOfDay(now);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(today, index - days + 1);
    const nextDay = addDays(date, 1);
    const changedSince = movements
      .filter((movement) => movedAt(movement, now) >= nextDay)
      .reduce((sum, movement) => sum + movement.change, 0);
    return { date, units: currentUnits - changedSince };
  });
}

const shortDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function groupByDay(movements: Movement[], now: Date) {
  const today = startOfDay(now).getTime();
  const yesterday = addDays(startOfDay(now), -1).getTime();
  const groups: { label: string; net: number; movements: Movement[] }[] = [];
  const byDay = new Map<number, (typeof groups)[number]>();
  for (const movement of movements) {
    const date = startOfDay(movedAt(movement, now));
    const day = date.getTime();
    let group = byDay.get(day);
    if (!group) {
      const prefix =
        day === today ? "Today, " : day === yesterday ? "Yesterday, " : "";
      group = { label: prefix + shortDate(date), net: 0, movements: [] };
      byDay.set(day, group);
      groups.push(group);
    }
    group.net += movement.change;
    group.movements.push(movement);
  }
  return groups;
}

export function categoryTotals(products: Product[]) {
  const totals = new Map<string, { units: number; capacity: number }>();
  for (const product of products) {
    const total = totals.get(product.category) ?? { units: 0, capacity: 0 };
    total.units += product.quantity;
    total.capacity += shelfCapacity(product);
    totals.set(product.category, total);
  }
  return [...totals]
    .map(([category, total]) => ({ category, ...total }))
    .sort((a, b) => b.units - a.units || b.capacity - a.capacity);
}

export function chartAxis(values: number[]) {
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (low === high) {
    high = low + 4;
    low = Math.max(low - 4, 0);
  }
  const rough = (high - low) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].find((factor) => factor * magnitude >= rough)! * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = min; tick <= max; tick += step) ticks.push(tick);
  return { min, max, ticks };
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

// The 14-day chart needs every change in range, not just the latest 50.
export function subscribeToRecentMovements(
  db: Firestore,
  uid: string,
  days: number,
  onData: (movements: Movement[]) => void,
  onError: (message: string) => void,
) {
  const since = addDays(startOfDay(new Date()), 1 - days);
  return onSnapshot(
    query(
      movementsPath(db, uid),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(2000),
    ),
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

export type SaveResult = "saved" | "queued";

const offlineWait = 8000;
let reportSyncFailure: (error: unknown) => void = () => {};
export function onSyncFailure(listener: (error: unknown) => void) {
  reportSyncFailure = listener;
}

// Firestore only resolves a write once the server confirms it, so an offline
// write would wait forever. Past the wait it stays queued on this device.
function settle(write: Promise<void>): Promise<SaveResult> {
  return new Promise((resolve, reject) => {
    let queued = false;
    const timer = setTimeout(
      () => {
        queued = true;
        resolve("queued");
      },
      navigator.onLine === false ? 0 : offlineWait,
    );
    write.then(
      () => {
        clearTimeout(timer);
        resolve("saved");
      },
      (error) => {
        clearTimeout(timer);
        if (queued) reportSyncFailure(error);
        else reject(error);
      },
    );
  });
}

async function settleAll(batches: WriteBatch[]): Promise<SaveResult> {
  const results = await Promise.all(
    batches.map((batch) => settle(batch.commit())),
  );
  return results.includes("queued") ? "queued" : "saved";
}

// Firestore allows 500 writes per batch; each item here writes two documents.
const itemsPerBatch = 200;
function inBatches<T>(
  db: Firestore,
  items: T[],
  write: (batch: WriteBatch, item: T) => void,
) {
  const batches: WriteBatch[] = [];
  for (let start = 0; start < items.length; start += itemsPerBatch) {
    const batch = writeBatch(db);
    for (const item of items.slice(start, start + itemsPerBatch))
      write(batch, item);
    batches.push(batch);
  }
  return batches;
}

async function readProduct(db: Firestore, uid: string, id: string) {
  const ref = doc(db, "users", uid, "products", id);
  let snapshot;
  try {
    snapshot = await getDocFromCache(ref);
  } catch {
    snapshot = await getDoc(ref);
  }
  if (!snapshot.exists()) throw new Error("This product no longer exists.");
  return { id, ...snapshot.data() } as Product;
}

function addProduct(
  db: Firestore,
  uid: string,
  batch: WriteBatch,
  input: ProductInput,
) {
  const productRef = doc(productsPath(db, uid));
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
  batch.set(doc(movementsPath(db, uid)), {
    productId: productRef.id,
    productName: input.name.trim(),
    kind: "opening",
    change: input.quantity,
    quantityBefore: 0,
    quantityAfter: input.quantity,
    note: "Initial stock",
    createdAt: serverTimestamp(),
  });
}

export async function createProducts(
  db: Firestore,
  uid: string,
  inputs: ProductInput[],
) {
  for (const input of inputs) {
    const error = validateProduct(input, true);
    if (error) throw new Error(`${input.name}: ${error}`);
  }
  return settleAll(
    inBatches(db, inputs, (batch, input) => addProduct(db, uid, batch, input)),
  );
}

export async function createProduct(
  db: Firestore,
  uid: string,
  input: ProductInput,
) {
  const error = validateProduct(input, true);
  if (error) throw new Error(error);
  return createProducts(db, uid, [input]);
}

export async function editProduct(
  db: Firestore,
  uid: string,
  id: string,
  input: ProductInput,
) {
  const error = validateProduct(input, false);
  if (error) throw new Error(error);
  return settle(
    updateDoc(doc(db, "users", uid, "products", id), {
      name: input.name.trim(),
      sku: input.sku.trim(),
      category: input.category.trim(),
      lowStockThreshold: input.lowStockThreshold,
      targetStock: input.targetStock,
      supplier: input.supplier.trim(),
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function removeProduct(db: Firestore, uid: string, id: string) {
  const product = await readProduct(db, uid, id);
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", uid, "products", id));
  batch.set(doc(movementsPath(db, uid)), {
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
  return settle(batch.commit());
}

export type StockChange = {
  product: Pick<Product, "id" | "name" | "quantity">;
  action: StockAction;
};

function nextQuantity({ product, action }: StockChange) {
  const { kind, amount } = action;
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    (kind !== "correction" && amount === 0)
  )
    throw new Error("Enter a valid whole-number quantity.");
  if (action.note.trim().length > 200)
    throw new Error("Note must be at most 200 characters.");
  const next =
    kind === "correction"
      ? amount
      : kind === "restock"
        ? product.quantity + amount
        : product.quantity - amount;
  if (!Number.isSafeInteger(next) || next < 0)
    throw new Error(
      `Insufficient stock for ${product.name}: ${product.quantity} on hand.`,
    );
  if (next === product.quantity)
    throw new Error("The stock count is already correct.");
  return next;
}

// Writes use increment rather than a transaction so they can queue offline.
// A count sets the exact number, because that is what was seen on the shelf.
export async function recordStockChanges(
  db: Firestore,
  uid: string,
  changes: StockChange[],
) {
  const planned = changes.map((change) => ({
    ...change,
    next: nextQuantity(change),
  }));
  return settleAll(
    inBatches(db, planned, (batch, { product, action, next }) => {
      const change = next - product.quantity;
      batch.update(doc(db, "users", uid, "products", product.id), {
        quantity: action.kind === "correction" ? next : increment(change),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(movementsPath(db, uid)), {
        productId: product.id,
        productName: product.name,
        kind: action.kind,
        change,
        quantityBefore: product.quantity,
        quantityAfter: next,
        note: action.note.trim(),
        createdAt: serverTimestamp(),
      });
    }),
  );
}

export async function adjustStock(
  db: Firestore,
  uid: string,
  id: string,
  action: StockAction,
) {
  const product = await readProduct(db, uid, id);
  return recordStockChanges(db, uid, [{ product, action }]);
}
