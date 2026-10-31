import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { settle } from "./firestoreWrites";
import type { Movement, Product, ProductInput } from "./inventory";

const productsPath = (db: Firestore, uid: string) =>
  collection(db, "users", uid, "products");
const movementsPath = (db: Firestore, uid: string) =>
  collection(db, "users", uid, "movements");

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
