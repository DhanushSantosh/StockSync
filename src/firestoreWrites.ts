import {
  writeBatch,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";

export type SaveResult = "saved" | "queued";

const offlineWait = 8000;
let reportSyncFailure: (error: unknown) => void = () => {};
export function onSyncFailure(listener: (error: unknown) => void) {
  reportSyncFailure = listener;
}

// Firestore only resolves a write once the server confirms it, so an offline
// write would wait forever. Past the wait it stays queued on this device.
export function settle(write: Promise<void>): Promise<SaveResult> {
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

export async function settleAll(batches: WriteBatch[]): Promise<SaveResult> {
  const results = await Promise.all(
    batches.map((batch) => settle(batch.commit())),
  );
  return results.includes("queued") ? "queued" : "saved";
}

// Firestore allows 500 writes per batch; each item here writes two documents.
const itemsPerBatch = 200;
export function inBatches<T>(
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
