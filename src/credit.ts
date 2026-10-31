import {
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
  type Timestamp,
  type WriteBatch,
} from "firebase/firestore";
import { settle } from "./firestoreWrites";

const normalized = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

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
export function writeCredit(
  db: Firestore,
  uid: string,
  batch: WriteBatch,
  customer: Pick<Customer, "id" | "name">,
  amount: number,
  note: string,
  actor?: string,
) {
  batch.update(doc(db, "users", uid, "customers", customer.id), {
    balance: increment(amount),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, "users", uid, "creditEntries")), {
    customerId: customer.id,
    customerName: customer.name,
    amount,
    note: note.trim(),
    ...(actor ? { by: actor } : {}),
    createdAt: serverTimestamp(),
  });
}

export function recordCredit(
  db: Firestore,
  uid: string,
  customer: Pick<Customer, "id" | "name">,
  amount: number,
  note: string,
  actor?: string,
) {
  const batch = writeBatch(db);
  writeCredit(db, uid, batch, customer, amount, note, actor);
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
