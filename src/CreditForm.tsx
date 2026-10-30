import { useEffect, useState, type FormEvent } from "react";
import { errorText, savedMessage } from "./display";
import { db } from "./firebase";
import {
  addCustomer,
  formatMoney,
  parseMoney,
  recordCredit,
  shopId,
  subscribeToCreditEntries,
  type CreditEntry,
  type Customer,
} from "./inventory";
import { Alert } from "./ui";
import { t } from "./i18n";

function CustomerRow({
  customer,
  entries,
  onNotice,
}: {
  customer: Customer;
  entries: CreditEntry[];
  onNotice: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function save(direction: 1 | -1) {
    if (!db) return;
    const paise = parseMoney(amount);
    if (!paise) {
      setProblem("Enter an amount like 250 or 99.50.");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const result = await recordCredit(
        db,
        shopId(),
        customer,
        direction * paise,
        note,
      );
      onNotice(
        savedMessage(
          result,
          direction > 0 ? t("Credit added.") : t("Payment recorded."),
        ),
      );
      setAmount("");
      setNote("");
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-line">
      <button
        className="btn-row flex w-full items-center justify-between gap-3 px-pad py-3"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{customer.name}</span>
          {customer.phone && (
            <span className="hint block truncate">{customer.phone}</span>
          )}
        </span>
        <span
          className={`tabular shrink-0 text-title font-semibold ${customer.balance > 0 ? "text-warn" : ""}`}
        >
          {formatMoney(customer.balance)}
        </span>
      </button>
      {open && (
        <div className="page space-y-3 px-pad pb-4">
          {problem && <Alert>{problem}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <label className="field-label">
              Amount, ₹
              <input
                className="field tabular"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </label>
            <label className="field-label">
              Note (optional)
              <input
                className="field"
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-soft"
              disabled={busy}
              onClick={() => save(1)}
            >
              {t("Add credit")}
            </button>
            <button
              className="btn-accent !rounded-control"
              disabled={busy}
              onClick={() => save(-1)}
            >
              {t("Record payment")}
            </button>
          </div>
          {entries.slice(0, 5).map((entry) => (
            <div key={entry.id} className="flex justify-between gap-3">
              <span className="hint min-w-0 truncate">
                {entry.createdAt?.toDate().toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                }) ?? "Just now"}
                {entry.note ? `, ${entry.note}` : ""}
              </span>
              <span
                className={`tabular shrink-0 text-caption ${entry.amount < 0 ? "text-gain" : ""}`}
              >
                {entry.amount < 0 ? "Paid " : ""}
                {formatMoney(Math.abs(entry.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CreditForm({
  customers,
  onNotice,
}: {
  customers: Customer[];
  onNotice: (message: string) => void;
}) {
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const owed = customers.reduce(
    (sum, customer) => sum + Math.max(customer.balance, 0),
    0,
  );

  useEffect(() => {
    if (!db) return;
    return subscribeToCreditEntries(db, shopId(), setEntries);
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!db) return;
    setBusy(true);
    setProblem("");
    try {
      const result = await addCustomer(
        db,
        shopId(),
        { name, phone },
        customers,
      );
      onNotice(savedMessage(result, t("Customer added.")));
      setName("");
      setPhone("");
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-gap">
      <section className="panel !px-0 !pb-0">
        <div className="px-pad pb-3">
          <h2 className="heading">Customers owe {formatMoney(owed)}</h2>
          <p className="hint mt-0.5">
            {t("Tap a customer to add credit or a payment.")}
          </p>
        </div>
        {customers.map((customer) => (
          <CustomerRow
            key={customer.id}
            customer={customer}
            entries={entries.filter((item) => item.customerId === customer.id)}
            onNotice={onNotice}
          />
        ))}
        {customers.length === 0 && (
          <p className="hint border-t border-line px-pad py-8 text-center">
            {t("No customers yet.")}
          </p>
        )}
      </section>
      <form onSubmit={add} className="panel space-y-3">
        <h2 className="heading">{t("Add a customer")}</h2>
        {problem && <Alert>{problem}</Alert>}
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">
            Name
            <input
              className="field"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label className="field-label">
            Phone (optional)
            <input
              className="field"
              type="tel"
              maxLength={20}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
        </div>
        <button className="btn-soft w-full" disabled={busy}>
          {t("Add customer")}
        </button>
      </form>
    </div>
  );
}
