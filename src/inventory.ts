import {
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Timestamp,
  type Transaction,
  type WriteBatch,
} from "firebase/firestore";
import { inBatches, settle, settleAll } from "./firestoreWrites";
import { writeCredit, type Customer } from "./credit";
import { removeSampleProducts } from "./shop";

const madeBy = (actor?: string) => (actor ? { by: actor } : {});

export const units = ["pcs", "kg", "L"] as const;
export type Unit = (typeof units)[number];

export type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  lowStockThreshold: number;
  targetStock?: number;
  supplier?: string;
  // Prices are whole paise, so totals never pick up rounding errors.
  costPrice?: number;
  sellPrice?: number;
  onOrder?: number;
  unit?: Unit;
  packSize?: number;
  expiryDate?: string;
  sample?: boolean;
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
  costPrice?: number;
  sellPrice?: number;
  unit?: Unit;
  packSize?: number;
  expiryDate?: string;
  sample?: boolean;
};

export type MovementKind =
  | "opening"
  | "restock"
  | "sale"
  | "return"
  | "damage"
  | "correction"
  | "deleted"
  | "undo";
export type Movement = {
  id: string;
  productId: string;
  productName: string;
  kind: MovementKind;
  change: number;
  quantityBefore: number;
  quantityAfter: number;
  note: string;
  undoes?: string;
  // Saved at the time, so later price changes don't rewrite past sales.
  revenue?: number;
  profit?: number;
  by?: string;
  createdAt?: Timestamp;
};

export type StockAction = {
  kind: "restock" | "sale" | "return" | "damage" | "correction";
  amount: number;
  note: string;
  // Sold more than the count says: take stock to zero and keep the real amount.
  clampAtZero?: boolean;
  // A delivery can bring a new expiry date.
  expiryDate?: string;
};

export const movementLabels: Record<MovementKind, string> = {
  opening: "Opening stock",
  restock: "Restocked",
  sale: "Sold",
  return: "Returned",
  damage: "Damaged / lost",
  correction: "Stock count",
  deleted: "Product deleted",
  undo: "Undone",
};

export const roundQuantity = (amount: number) =>
  Math.round(amount * 1000) / 1000;

const isLoose = (product: { unit?: Unit }) =>
  product.unit === "kg" || product.unit === "L";

// Whole units for countable stock; up to 3 decimals for weight and volume.
export function validQuantity(amount: number, product: { unit?: Unit }) {
  if (!Number.isFinite(amount) || amount < 0) return false;
  return isLoose(product)
    ? roundQuantity(amount) === amount
    : Number.isSafeInteger(amount);
}

export function formatQuantity(amount: number) {
  return roundQuantity(amount).toLocaleString("en-IN");
}

export const unitSuffix = (product: { unit?: Unit }) =>
  isLoose(product) ? ` ${product.unit}` : "";

export const packsNeeded = (quantity: number, packSize: number) =>
  Math.ceil(quantity / packSize);

export function findByCode(products: Product[], code: string) {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return undefined;
  return products.find((product) => product.sku.toLowerCase() === wanted);
}

export function expiringSoon(products: Product[], now: Date, within = 30) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return products
    .filter((product) => product.expiryDate && product.quantity > 0)
    .map((product) => {
      const [year, month, day] = product.expiryDate!.split("-").map(Number);
      const expiry = new Date(year, month - 1, day);
      const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
      return { product, days };
    })
    .filter(({ days }) => days <= within)
    .sort((a, b) => a.days - b.days);
}

export function statusOf(product: Product): "out" | "low" | "healthy" {
  if (product.quantity === 0) return "out";
  return product.quantity <= product.lowStockThreshold ? "low" : "healthy";
}

export function suggestedReorder(product: Product): number | null {
  if (statusOf(product) === "healthy") return null;
  if (!product.targetStock || product.targetStock <= product.quantity)
    return null;
  const needed =
    product.targetStock - product.quantity - (product.onOrder ?? 0);
  return needed > 0 ? needed : null;
}

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const wholeRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatMoney(paise: number) {
  const format = paise % 100 === 0 ? wholeRupees : rupees;
  const text = format.format(Math.abs(paise) / 100);
  return paise < 0 ? `−${text}` : text;
}

// Whole paise from what someone typed: blank is 0, nonsense is null.
export function parseMoney(text: string) {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

export function stockValue(products: Product[]) {
  return {
    value: products.reduce(
      (sum, product) => sum + product.quantity * (product.costPrice ?? 0),
      0,
    ),
    unpriced: products.filter(
      (product) => product.quantity > 0 && !product.costPrice,
    ).length,
  };
}

export function moneyForChange(
  product: Pick<Product, "costPrice" | "sellPrice">,
  kind: StockAction["kind"],
  units: number,
) {
  if ((kind !== "sale" && kind !== "return") || !product.sellPrice) return {};
  const signedUnits = kind === "sale" ? units : 0 - units;
  const revenue = Math.round(signedUnits * product.sellPrice);
  return product.costPrice
    ? {
        revenue,
        profit: Math.round(
          signedUnits * (product.sellPrice - product.costPrice),
        ),
      }
    : { revenue };
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
    units: roundQuantity(
      products.reduce((sum, product) => sum + product.quantity, 0),
    ),
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
    return { date, units: roundQuantity(currentUnits - changedSince) };
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

const normalized = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

export function duplicateProblem(
  input: Pick<Product, "name" | "sku">,
  products: Pick<Product, "id" | "name" | "sku">[],
  ignoreId?: string,
) {
  const others = products.filter((product) => product.id !== ignoreId);
  const sku = normalized(input.sku);
  const sameSku = sku && others.find((item) => normalized(item.sku) === sku);
  if (sameSku) return `SKU ${sameSku.sku} is already used by ${sameSku.name}.`;
  const name = normalized(input.name);
  const sameName = others.find((item) => normalized(item.name) === name);
  return sameName
    ? `You already have a product called ${sameName.name}.`
    : null;
}

export function matchCategory(value: string, categories: string[]) {
  const wanted = normalized(value);
  return (
    categories.find((category) => normalized(category) === wanted) ??
    value.trim()
  );
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row++) {
    const current = [row];
    for (let column = 1; column <= b.length; column++)
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[b.length];
}

// A likely typo of an existing category, for a "did you mean" prompt.
export function similarCategory(value: string, categories: string[]) {
  const wanted = normalized(value);
  if (wanted.length < 4) return null;
  if (categories.some((category) => normalized(category) === wanted))
    return null;
  return (
    categories.find(
      (category) => editDistance(normalized(category), wanted) <= 2,
    ) ?? null
  );
}

const undoable: MovementKind[] = [
  "restock",
  "sale",
  "return",
  "damage",
  "correction",
];

export function undoneIds(movements: Pick<Movement, "undoes">[]) {
  return new Set(movements.flatMap(({ undoes }) => (undoes ? [undoes] : [])));
}

export function canUndo(
  movement: Pick<Movement, "id" | "kind" | "change">,
  undone: Set<string>,
) {
  return (
    undoable.includes(movement.kind) &&
    movement.change !== 0 &&
    !undone.has(movement.id)
  );
}

export function salesSummary(
  movements: Pick<Movement, "createdAt" | "revenue" | "profit">[],
  since: Date,
  now: Date,
) {
  const inRange = movements.filter(
    (movement) => movedAt(movement, now) >= since,
  );
  return {
    revenue: inRange.reduce((sum, item) => sum + (item.revenue ?? 0), 0),
    profit: inRange.reduce((sum, item) => sum + (item.profit ?? 0), 0),
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
  if (!validQuantity(input.lowStockThreshold, input))
    return "Low stock threshold must be a nonnegative whole number.";
  if (!validQuantity(input.targetStock, input))
    return "Restock target must be a nonnegative whole number.";
  if (
    input.packSize !== undefined &&
    (!Number.isSafeInteger(input.packSize) || input.packSize < 1)
  )
    return "Pack size must be a whole number of 1 or more.";
  if (input.targetStock > 0 && input.targetStock <= input.lowStockThreshold)
    return "Restock target must be above the low-stock alert level.";
  for (const price of [input.costPrice ?? 0, input.sellPrice ?? 0])
    if (!Number.isSafeInteger(price) || price < 0)
      return "Prices must be nonnegative amounts.";
  if (creating && !validQuantity(input.quantity ?? -1, input))
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
  count: number,
  onData: (movements: Movement[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    query(movementsPath(db, uid), orderBy("createdAt", "desc"), limit(count)),
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

export async function fetchAllMovements(db: Firestore, uid: string) {
  const snapshot = await getDocs(
    query(movementsPath(db, uid), orderBy("createdAt", "desc")),
  );
  return snapshot.docs.map(
    (item) => ({ id: item.id, ...item.data() }) as Movement,
  );
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
  actor?: string,
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
    costPrice: input.costPrice ?? 0,
    sellPrice: input.sellPrice ?? 0,
    unit: input.unit ?? "pcs",
    packSize: input.packSize ?? 1,
    expiryDate: input.expiryDate ?? "",
    ...(input.sample ? { sample: true } : {}),
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
    ...madeBy(actor),
    createdAt: serverTimestamp(),
  });
}

export async function createProducts(
  db: Firestore,
  uid: string,
  inputs: ProductInput[],
  actor?: string,
) {
  for (const input of inputs) {
    const error = validateProduct(input, true);
    if (error) throw new Error(`${input.name}: ${error}`);
  }
  return settleAll(
    inBatches(db, inputs, (batch, input) =>
      addProduct(db, uid, batch, input, actor),
    ),
  );
}

export async function createProduct(
  db: Firestore,
  uid: string,
  input: ProductInput,
  actor?: string,
) {
  const error = validateProduct(input, true);
  if (error) throw new Error(error);
  return createProducts(db, uid, [input], actor);
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
      costPrice: input.costPrice ?? 0,
      sellPrice: input.sellPrice ?? 0,
      unit: input.unit ?? "pcs",
      packSize: input.packSize ?? 1,
      expiryDate: input.expiryDate ?? "",
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function removeProduct(
  db: Firestore,
  uid: string,
  id: string,
  actor?: string,
) {
  const product = await readProduct(db, uid, id);
  if (product.sample) {
    await removeSampleProducts(db, uid, [product]);
    return "saved";
  }
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
    ...madeBy(actor),
    createdAt: serverTimestamp(),
  });
  return settle(batch.commit());
}

export type StockChange = {
  product: Pick<
    Product,
    "id" | "name" | "quantity" | "costPrice" | "sellPrice" | "onOrder" | "unit"
  >;
  action: StockAction;
};

function nextQuantity({ product, action }: StockChange) {
  const { kind, amount } = action;
  if (
    !validQuantity(amount, product) ||
    (kind !== "correction" && amount === 0)
  )
    throw new Error(
      isLoose(product)
        ? "Enter an amount with up to 3 decimals."
        : "Enter a valid whole-number quantity.",
    );
  if (action.note.trim().length > 200)
    throw new Error("Note must be at most 200 characters.");
  const next = roundQuantity(
    kind === "correction"
      ? amount
      : kind === "restock" || kind === "return"
        ? product.quantity + amount
        : product.quantity - amount,
  );
  if (next < 0 && action.clampAtZero) return 0;
  if (next < 0)
    throw new Error(
      `Insufficient stock for ${product.name}: ${product.quantity} on hand.`,
    );
  if (
    next === product.quantity &&
    !(kind === "sale" && action.clampAtZero && amount > 0)
  )
    throw new Error("The stock count is already correct.");
  return next;
}

function noteFor({ product, action }: StockChange) {
  const note = action.note.trim();
  if (!action.clampAtZero || action.amount <= product.quantity) return note;
  const shortfall = `${action.amount} sold with ${product.quantity} on hand`;
  return (note ? `${shortfall}. ${note}` : shortfall).slice(0, 200);
}

// Online writes read current stock in a transaction. Offline relative changes
// use increments so they can queue until the device reconnects.
type PlannedStockChange = StockChange & { next: number; note: string };

function writeStockChange(
  db: Firestore,
  uid: string,
  batch: WriteBatch | Transaction,
  { product, action, next, note }: PlannedStockChange,
  actor?: string,
  offline = false,
) {
  const change = roundQuantity(next - product.quantity);
  const productRef = doc(db, "users", uid, "products", product.id);
  const movementRef = doc(movementsPath(db, uid));
  const update = {
    quantity: offline ? increment(change) : next,
    ...(action.expiryDate ? { expiryDate: action.expiryDate } : {}),
    // A delivery comes off whatever was on order.
    ...(action.kind === "restock" && product.onOrder
      ? { onOrder: Math.max(product.onOrder - action.amount, 0) }
      : {}),
    updatedAt: serverTimestamp(),
  };
  const movement = {
    productId: product.id,
    productName: product.name,
    kind: action.kind,
    change,
    quantityBefore: product.quantity,
    quantityAfter: next,
    note,
    ...moneyForChange(product, action.kind, action.amount),
    ...madeBy(actor),
    createdAt: serverTimestamp(),
  };
  if ("commit" in batch) {
    batch.update(productRef, update);
    batch.set(movementRef, movement);
  } else {
    batch.update(productRef, update);
    batch.set(movementRef, movement);
  }
}

export async function recordStockChanges(
  db: Firestore,
  uid: string,
  changes: StockChange[],
  credit?: { customer: Pick<Customer, "id" | "name">; amount: number },
  actor?: string,
) {
  if (credit) {
    // Two writes per product plus two for the customer must fit one atomic batch.
    if (changes.length > 100)
      throw new Error("A credit sale can contain at most 100 products.");
  }
  if (navigator.onLine === false) {
    if (
      changes.some(
        ({ product, action }) =>
          action.kind === "correction" ||
          (action.clampAtZero && action.amount > product.quantity) ||
          (action.kind === "restock" && !!product.onOrder),
      )
    )
      throw new Error(
        "Connect to the internet to count stock, receive an order, or sell beyond recorded stock.",
      );
    const planned = changes.map((change) => ({
      ...change,
      next: nextQuantity(change),
      note: noteFor(change),
    }));
    if (!credit)
      return settleAll(
        inBatches(db, planned, (batch, change) =>
          writeStockChange(db, uid, batch, change, actor, true),
        ),
      );
    const batch = writeBatch(db);
    for (const change of planned)
      writeStockChange(db, uid, batch, change, actor, true);
    writeCredit(db, uid, batch, credit.customer, credit.amount, "Sale", actor);
    return settle(batch.commit());
  }
  for (let start = 0; start < changes.length; start += 100) {
    const group = changes.slice(start, start + 100);
    await runTransaction(db, async (transaction) => {
      // Firestore requires every read before the first write.
      const snapshots = await Promise.all(
        group.map(({ product }) =>
          transaction.get(doc(db, "users", uid, "products", product.id)),
        ),
      );
      const planned = group.map((change, index) => {
        const snapshot = snapshots[index];
        if (!snapshot.exists())
          throw new Error(`${change.product.name} no longer exists.`);
        const product = { id: snapshot.id, ...snapshot.data() } as Product;
        if (
          change.action.kind === "correction" &&
          product.quantity !== change.product.quantity
        )
          throw new Error(
            `${product.name} changed while you were counting. Review the count and try again.`,
          );
        if (
          change.action.kind === "sale" &&
          product.sellPrice !== change.product.sellPrice
        )
          throw new Error(
            `${product.name} price changed. Review the sale and try again.`,
          );
        const current = { product, action: change.action };
        return {
          ...current,
          next: nextQuantity(current),
          note: noteFor(current),
        };
      });
      for (const change of planned)
        writeStockChange(db, uid, transaction, change, actor);
      if (credit)
        writeCredit(
          db,
          uid,
          transaction,
          credit.customer,
          credit.amount,
          "Sale",
          actor,
        );
    });
  }
  return "saved";
}

export async function adjustStock(
  db: Firestore,
  uid: string,
  id: string,
  action: StockAction,
  actor?: string,
) {
  const product = await readProduct(db, uid, id);
  return recordStockChanges(db, uid, [{ product, action }], undefined, actor);
}

export async function undoMovement(
  db: Firestore,
  uid: string,
  movement: Movement,
  actor?: string,
) {
  const productRef = doc(db, "users", uid, "products", movement.productId);
  const undoRef = doc(movementsPath(db, uid), `undo-${movement.id}`);
  const plan = (product: Product) => {
    const next = roundQuantity(product.quantity - movement.change);
    if (next < 0)
      throw new Error(
        `This would take ${product.name} below zero. Record a stock count instead.`,
      );
    return {
      next,
      entry: {
        productId: product.id,
        productName: product.name,
        kind: "undo",
        change: 0 - movement.change,
        quantityBefore: product.quantity,
        quantityAfter: next,
        note: movementLabels[movement.kind],
        undoes: movement.id,
        ...madeBy(actor),
        ...(movement.revenue ? { revenue: 0 - movement.revenue } : {}),
        ...(movement.profit ? { profit: 0 - movement.profit } : {}),
        createdAt: serverTimestamp(),
      },
    };
  };
  if (navigator.onLine === false) {
    const product = await readProduct(db, uid, movement.productId);
    const { entry } = plan(product);
    const batch = writeBatch(db);
    batch.update(productRef, {
      quantity: increment(0 - movement.change),
      updatedAt: serverTimestamp(),
    });
    batch.set(undoRef, entry);
    return settle(batch.commit());
  }
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(productRef);
    const previousUndo = await transaction.get(undoRef);
    if (!snapshot.exists()) throw new Error("This product no longer exists.");
    if (previousUndo.exists())
      throw new Error("This change was already undone.");
    const product = { id: snapshot.id, ...snapshot.data() } as Product;
    const { next, entry } = plan(product);
    transaction.update(productRef, {
      quantity: next,
      updatedAt: serverTimestamp(),
    });
    transaction.set(undoRef, entry);
  });
  return "saved";
}

export function markOrdered(
  db: Firestore,
  uid: string,
  lines: { id: string; units: number }[],
) {
  return settleAll(
    inBatches(db, lines, (batch, { id, units }) =>
      batch.update(doc(db, "users", uid, "products", id), {
        onOrder: units,
        updatedAt: serverTimestamp(),
      }),
    ),
  );
}

export function cancelOrder(db: Firestore, uid: string, ids: string[]) {
  return markOrdered(
    db,
    uid,
    ids.map((id) => ({ id, units: 0 })),
  );
}

export function receiveOrder(
  db: Firestore,
  uid: string,
  products: Product[],
  actor?: string,
) {
  return recordStockChanges(
    db,
    uid,
    products.map((product) => ({
      product,
      action: {
        kind: "restock" as const,
        amount: product.onOrder ?? 0,
        note: "Order received",
      },
    })),
    undefined,
    actor,
  );
}
