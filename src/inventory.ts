import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from "firebase/firestore";

// The shop being worked on, which is a staff member's employer's account.
let activeShop = "";
let actor = "";
export const shopId = () => activeShop;
export function setShop(shop: string, email: string) {
  activeShop = shop;
  actor = email;
}
const madeBy = () => (actor ? { by: actor } : {});

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
    ...madeBy(),
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
      costPrice: input.costPrice ?? 0,
      sellPrice: input.sellPrice ?? 0,
      unit: input.unit ?? "pcs",
      packSize: input.packSize ?? 1,
      expiryDate: input.expiryDate ?? "",
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function removeProduct(db: Firestore, uid: string, id: string) {
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
    ...madeBy(),
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
  if (next === product.quantity)
    throw new Error("The stock count is already correct.");
  return next;
}

function noteFor({ product, action }: StockChange) {
  const note = action.note.trim();
  if (!action.clampAtZero || action.amount <= product.quantity) return note;
  const shortfall = `${action.amount} sold with ${product.quantity} on hand`;
  return (note ? `${shortfall}. ${note}` : shortfall).slice(0, 200);
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
    note: noteFor(change),
  }));
  return settleAll(
    inBatches(db, planned, (batch, { product, action, next, note }) => {
      const change = roundQuantity(next - product.quantity);
      batch.update(doc(db, "users", uid, "products", product.id), {
        // Decimals would drift under increment, so loose goods store the total.
        quantity:
          action.kind === "correction" || action.clampAtZero || isLoose(product)
            ? next
            : increment(change),
        ...(action.expiryDate ? { expiryDate: action.expiryDate } : {}),
        // A delivery comes off whatever was on order.
        ...(action.kind === "restock" && product.onOrder
          ? { onOrder: Math.max(product.onOrder - action.amount, 0) }
          : {}),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(movementsPath(db, uid)), {
        productId: product.id,
        productName: product.name,
        kind: action.kind,
        change,
        quantityBefore: product.quantity,
        quantityAfter: next,
        note,
        ...moneyForChange(product, action.kind, action.amount),
        ...madeBy(),
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

export async function undoMovement(
  db: Firestore,
  uid: string,
  movement: Movement,
) {
  const product = await readProduct(db, uid, movement.productId);
  const next = roundQuantity(product.quantity - movement.change);
  if (next < 0)
    throw new Error(
      `This would take ${product.name} below zero. Record a stock count instead.`,
    );
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid, "products", product.id), {
    quantity: isLoose(product) ? next : increment(0 - movement.change),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(movementsPath(db, uid), `undo-${movement.id}`), {
    productId: product.id,
    productName: product.name,
    kind: "undo",
    change: 0 - movement.change,
    quantityBefore: product.quantity,
    quantityAfter: next,
    note: movementLabels[movement.kind],
    undoes: movement.id,
    ...madeBy(),
    ...(movement.revenue ? { revenue: 0 - movement.revenue } : {}),
    ...(movement.profit ? { profit: 0 - movement.profit } : {}),
    createdAt: serverTimestamp(),
  });
  return settle(batch.commit());
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

export function receiveOrder(db: Firestore, uid: string, products: Product[]) {
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
  );
}

const inviteAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function cancelInvites(db: Firestore, uid: string) {
  const old = await getDocs(
    query(collection(db, "shopInvites"), where("owner", "==", uid)),
  );
  await Promise.all(old.docs.map((item) => deleteDoc(item.ref)));
}

export const shopKinds = [
  "Groceries",
  "Stationery",
  "Medical",
  "Hardware",
  "Other",
] as const;
export type ShopKind = (typeof shopKinds)[number];

export const defaultAlertLevel = 5;
export const endOfDayNote = "End-of-day count";

export type ShopProfile = {
  name?: string;
  kind?: ShopKind;
  setupDone?: boolean;
  checklistHidden?: boolean;
};

export const categoryFor = (kind: ShopKind) =>
  kind === "Other" ? "General" : kind;

const sampleItems: Record<ShopKind, [string, string, number, number][]> = {
  Groceries: [
    ["Parle-G 250g", "Biscuits", 48, 2500],
    ["Tata Salt 1kg", "Staples", 30, 2800],
    ["Amul Butter 100g", "Dairy", 3, 5600],
    ["Surf Excel 500g", "Household", 12, 7500],
    ["Maggi Noodles 70g", "Snacks", 0, 1400],
  ],
  Stationery: [
    ["Classmate Notebook", "Notebooks", 40, 6000],
    ["Reynolds Pen", "Pens", 120, 1000],
    ["Fevicol 50g", "Adhesives", 4, 3000],
    ["Geometry Box", "School", 15, 12000],
    ["A4 Paper 500 sheets", "Paper", 0, 28000],
  ],
  Medical: [
    ["Dolo 650 Strip", "Tablets", 50, 3000],
    ["Dettol 100ml", "Antiseptics", 14, 5500],
    ["ORS Sachet", "Wellness", 3, 2100],
    ["Band-Aid Pack", "First aid", 20, 4500],
    ["Vicks VapoRub 25g", "Cold care", 0, 9000],
  ],
  Hardware: [
    ["Wood Screws Box", "Fasteners", 25, 12000],
    ["Insulation Tape", "Electrical", 40, 2000],
    ["LED Bulb 9W", "Electrical", 4, 9900],
    ["Paint Brush 2 inch", "Paint", 18, 6500],
    ["Hammer 500g", "Tools", 0, 25000],
  ],
  Other: [
    ["Sample Item A", "General", 30, 5000],
    ["Sample Item B", "General", 14, 12000],
    ["Sample Item C", "General", 3, 8000],
    ["Sample Item D", "General", 0, 2500],
  ],
};

export function sampleProducts(kind: ShopKind): ProductInput[] {
  return sampleItems[kind].map(([name, category, quantity, sellPrice]) => ({
    name,
    sku: "",
    category,
    quantity,
    lowStockThreshold: defaultAlertLevel,
    targetStock: 20,
    supplier: "Sample supplier",
    sellPrice,
    costPrice: Math.round(sellPrice * 0.8),
    sample: true,
  }));
}

export function gettingStarted(
  products: Pick<Product, "sample" | "lowStockThreshold" | "targetStock">[],
  movements: Pick<Movement, "kind" | "note">[],
) {
  const own = products.filter((product) => !product.sample);
  return [
    { label: "Add your products", done: own.length > 0 },
    {
      label: "Record your first sale",
      done: movements.some((item) => item.kind === "sale"),
    },
    {
      label: "Set your alert levels",
      done: own.some(
        (product) =>
          product.lowStockThreshold !== defaultAlertLevel ||
          (product.targetStock ?? 0) > 0,
      ),
    },
    {
      label: "Do one end-of-day count",
      done: movements.some((item) => item.note === endOfDayNote),
    },
  ];
}

const profileRef = (db: Firestore, uid: string) =>
  doc(db, "users", uid, "profile", "shop");

export function subscribeToProfile(
  db: Firestore,
  uid: string,
  onData: (profile: ShopProfile) => void,
) {
  return onSnapshot(
    profileRef(db, uid),
    (snapshot) => onData((snapshot.data() ?? {}) as ShopProfile),
    () => onData({}),
  );
}

export const saveProfile = (db: Firestore, uid: string, changes: ShopProfile) =>
  settle(setDoc(profileRef(db, uid), changes, { merge: true }));

// History is removed first: the rules allow that only while the product exists.
export async function removeSampleProducts(
  db: Firestore,
  uid: string,
  products: Product[],
) {
  if (navigator.onLine === false)
    throw new Error("Connect to the internet to remove sample products.");
  const samples = products.filter((product) => product.sample);
  for (const product of samples) {
    const history = await getDocsFromServer(
      query(movementsPath(db, uid), where("productId", "==", product.id)),
    );
    for (let start = 0; start < history.docs.length; start += 400) {
      const batch = writeBatch(db);
      for (const item of history.docs.slice(start, start + 400))
        batch.delete(item.ref);
      await batch.commit();
    }
  }
  for (let start = 0; start < samples.length; start += 400) {
    const batch = writeBatch(db);
    for (const product of samples.slice(start, start + 400))
      batch.delete(doc(productsPath(db, uid), product.id));
    await batch.commit();
  }
}

export async function createInvite(db: Firestore, uid: string) {
  await cancelInvites(db, uid);
  const code = [...crypto.getRandomValues(new Uint8Array(8))]
    .map((value) => inviteAlphabet[value % inviteAlphabet.length])
    .join("");
  await setDoc(doc(db, "shopInvites", code), { owner: uid });
  return code;
}

export async function joinShop(
  db: Firestore,
  uid: string,
  email: string,
  rawCode: string,
) {
  const code = rawCode.trim().toUpperCase();
  const invite = code ? await getDoc(doc(db, "shopInvites", code)) : null;
  if (!invite?.exists()) throw new Error("That invite code isn't valid.");
  const owner = invite.data().owner as string;
  if (owner === uid) throw new Error("That code is for your own shop.");
  const batch = writeBatch(db);
  batch.set(doc(db, "users", owner, "members", uid), { email, code });
  batch.set(doc(db, "memberships", uid), { owner });
  await batch.commit();
  return owner;
}

export function subscribeToMembership(
  db: Firestore,
  uid: string,
  onData: (owner: string | null) => void,
) {
  // Waits for the server: until then the owner's rules would refuse this user.
  return onSnapshot(
    doc(db, "memberships", uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return;
      onData(snapshot.exists() ? (snapshot.data().owner as string) : null);
    },
    () => onData(null),
  );
}

export const forgetShop = (db: Firestore, uid: string) =>
  deleteDoc(doc(db, "memberships", uid));

export async function leaveShop(db: Firestore, uid: string, owner: string) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "users", owner, "members", uid));
  batch.delete(doc(db, "memberships", uid));
  await batch.commit();
}

export type Member = { id: string; email: string };

export function subscribeToMembers(
  db: Firestore,
  owner: string,
  onData: (members: Member[]) => void,
) {
  return onSnapshot(collection(db, "users", owner, "members"), (snapshot) =>
    onData(
      snapshot.docs.map((item) => ({ id: item.id, email: item.data().email })),
    ),
  );
}

// A removed person could otherwise walk back in with the same code.
export async function removeMember(
  db: Firestore,
  owner: string,
  member: string,
) {
  await cancelInvites(db, owner);
  await deleteDoc(doc(db, "users", owner, "members", member));
}

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  // Paise owed to the shop.
  balance: number;
};

export type CreditEntry = {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  note: string;
  by?: string;
  createdAt?: Timestamp;
};

export async function addCustomer(
  db: Firestore,
  uid: string,
  input: { name: string; phone: string },
  existing: Pick<Customer, "name">[],
) {
  const name = input.name.trim();
  if (!name || name.length > 100)
    throw new Error("Name must be 1–100 characters.");
  if (existing.some((item) => normalized(item.name) === normalized(name)))
    throw new Error(`You already have a customer called ${name}.`);
  return settle(
    setDoc(doc(collection(db, "users", uid, "customers")), {
      name,
      phone: input.phone.trim(),
      balance: 0,
      updatedAt: serverTimestamp(),
    }),
  );
}

// A positive amount is goods on credit; a negative amount is a payment.
export function recordCredit(
  db: Firestore,
  uid: string,
  customer: Pick<Customer, "id" | "name">,
  amount: number,
  note: string,
) {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid, "customers", customer.id), {
    balance: increment(amount),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "users", uid, "creditEntries")), {
    customerId: customer.id,
    customerName: customer.name,
    amount,
    note: note.trim(),
    ...madeBy(),
    createdAt: serverTimestamp(),
  });
  return settle(batch.commit());
}

export function subscribeToCustomers(
  db: Firestore,
  uid: string,
  onData: (customers: Customer[]) => void,
  onError: (message: string) => void,
) {
  return onSnapshot(
    collection(db, "users", uid, "customers"),
    (snapshot) =>
      onData(
        snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as Customer)
          .sort((a, b) => b.balance - a.balance),
      ),
    (error) => onError(error.message),
  );
}

export function subscribeToCreditEntries(
  db: Firestore,
  uid: string,
  onData: (entries: CreditEntry[]) => void,
) {
  return onSnapshot(
    query(
      collection(db, "users", uid, "creditEntries"),
      orderBy("createdAt", "desc"),
      limit(200),
    ),
    (snapshot) =>
      onData(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as CreditEntry,
        ),
      ),
  );
}

const shopCollections = [
  "profile",
  "products",
  "movements",
  "customers",
  "creditEntries",
  "members",
];

// Reads from the server so nothing is missed by a partial offline cache. If it
// stops partway, running it again finishes the job.
export async function deleteAccountData(
  db: Firestore,
  uid: string,
  employer: string | null,
) {
  if (employer) await leaveShop(db, uid, employer);
  await cancelInvites(db, uid);
  const closing = doc(db, "users", uid, "closing", "request");
  await setDoc(closing, {});
  for (const name of shopCollections) {
    const records = await getDocsFromServer(collection(db, "users", uid, name));
    for (let start = 0; start < records.docs.length; start += 400) {
      const batch = writeBatch(db);
      for (const item of records.docs.slice(start, start + 400))
        batch.delete(item.ref);
      await batch.commit();
    }
  }
  await deleteDoc(closing);
}
