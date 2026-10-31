import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import type { User } from "firebase/auth";
import { errorText } from "./display";
import { db } from "./firebase";
import { currentLanguage, setLanguage, t, type Language } from "./i18n";
import { ImportProducts } from "./ImportProducts";
import {
  categoryFor,
  createInvite,
  defaultAlertLevel,
  joinShop,
  sampleProducts,
  saveProfile,
  shopKinds,
  type ShopKind,
  type ShopProfile,
} from "./shop";
import {
  createProduct,
  createProducts,
  parseMoney,
  validQuantity,
  type Product,
} from "./inventory";
import { Alert } from "./ui";

type Step = "welcome" | "shop" | "products" | "staff" | "done";
type Start = "hand" | "csv" | "sample";

function Choice({
  title,
  detail,
  chosen,
  onChoose,
}: {
  title: string;
  detail: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className={`w-full rounded-control bg-panel px-4 py-3.5 text-left outline-2 transition-colors ${chosen ? "outline outline-accent" : "outline-transparent"}`}
      aria-pressed={chosen}
      onClick={onChoose}
    >
      <span className="block font-semibold">{title}</span>
      <span className="hint block">{detail}</span>
    </button>
  );
}

function Progress({
  filled,
  onBack,
  action,
}: {
  filled: number;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5">
      {onBack && (
        <button
          className="-ml-3 flex size-11 shrink-0 items-center justify-center text-muted"
          aria-label={t("Back")}
          onClick={onBack}
        >
          <ChevronLeft size={22} />
        </button>
      )}
      <div
        className="flex flex-1 gap-1"
        role="img"
        aria-label={`${t("Step")} ${filled} / 3`}
      >
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors ${step <= filled ? "bg-accent" : "bg-[#30333a]"}`}
          />
        ))}
      </div>
      {action}
    </div>
  );
}

export function Setup({
  user,
  profile,
  products,
  onDone,
}: {
  user: User;
  profile: ShopProfile;
  products: Product[];
  onDone: (tour: boolean) => void;
}) {
  const [step, setStep] = useState<Step>(profile.name ? "products" : "welcome");
  const [role, setRole] = useState<"owner" | "staff">("owner");
  const [code, setCode] = useState("");
  const [name, setName] = useState(profile.name ?? "");
  const [kind, setKind] = useState<ShopKind>(profile.kind ?? "Groceries");
  const [start, setStart] = useState<Start>("sample");
  const [product, setProduct] = useState({ name: "", stock: "", price: "" });
  const [added, setAdded] = useState<string[]>([]);
  const [invite, setInvite] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setProblem("");
    try {
      await work();
    } catch (cause) {
      setProblem(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (step !== "staff" || invite || !db) return;
    createInvite(db, user.uid).then(setInvite, (cause) =>
      setProblem(errorText(cause)),
    );
  }, [step, invite, user.uid]);

  function welcome(event: FormEvent) {
    event.preventDefault();
    if (role === "owner") return setStep("shop");
    run(async () => {
      if (!db) return;
      await joinShop(db, user.uid, user.email ?? "", code);
      await saveProfile(db, user.uid, { setupDone: true });
      onDone(true);
    });
  }

  function shop(event: FormEvent) {
    event.preventDefault();
    run(async () => {
      if (!db) return;
      await saveProfile(db, user.uid, { name: name.trim(), kind });
      setStep("products");
    });
  }

  async function addProduct() {
    if (!db) return;
    const quantity = Number(product.stock || "0");
    const sellPrice = product.price ? parseMoney(product.price) : 0;
    if (!validQuantity(quantity, {}))
      throw new Error("Enter stock as a whole number.");
    if (sellPrice === null) throw new Error("Enter a valid selling price.");
    await createProduct(
      db,
      user.uid,
      {
        name: product.name,
        sku: "",
        category: categoryFor(kind),
        quantity,
        lowStockThreshold: defaultAlertLevel,
        targetStock: 0,
        supplier: "",
        sellPrice,
      },
      user.email ?? "",
    );
    setAdded((names) => [...names, product.name.trim()]);
    setProduct({ name: "", stock: "", price: "" });
  }

  function firstProducts() {
    run(async () => {
      if (!db) return;
      if (start === "sample" && !products.some((item) => item.sample))
        await createProducts(
          db,
          user.uid,
          sampleProducts(kind),
          user.email ?? "",
        );
      if (start === "hand" && product.name.trim()) await addProduct();
      setStep("staff");
    });
  }

  function finish(tour: boolean) {
    run(async () => {
      if (db) await saveProfile(db, user.uid, { setupDone: true });
      onDone(tour);
    });
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
    } catch {
      setProblem(t("Couldn't copy. Write the code down instead."));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-gutter pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div key={step} className="page flex flex-1 flex-col">
        {step === "welcome" && (
          <form onSubmit={welcome} className="flex flex-1 flex-col">
            <p className="text-title font-semibold tracking-tight">StockSync</p>
            <h1 className="mt-6 text-heading leading-tight font-semibold">
              {t("Welcome to StockSync")}
            </h1>
            <p className="hint mt-1.5">
              {t(
                "Know what's on your shelves, what to reorder, and what you earned today.",
              )}
            </p>
            <div className="mt-5 grid gap-2.5">
              <Choice
                title={t("I run a shop")}
                detail={t("Set up your products and stock")}
                chosen={role === "owner"}
                onChoose={() => setRole("owner")}
              />
              <Choice
                title={t("I work at a shop")}
                detail={t("Join with a code from the owner")}
                chosen={role === "staff"}
                onChoose={() => setRole("staff")}
              />
            </div>
            {role === "staff" && (
              <label className="field-label mt-4">
                {t("Invite code")}
                <input
                  className="field uppercase"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </label>
            )}
            <label className="field-label mt-4">
              {t("Language")}
              <select
                className="field"
                value={currentLanguage()}
                onChange={(event) =>
                  setLanguage(event.target.value as Language)
                }
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </select>
            </label>
            <div className="flex-1" />
            {problem && (
              <div className="mt-4">
                <Alert>{problem}</Alert>
              </div>
            )}
            <button className="btn-accent mt-4 w-full" disabled={busy}>
              {role === "staff" ? t("Join shop") : t("Continue")}
            </button>
          </form>
        )}

        {step === "shop" && (
          <form onSubmit={shop} className="flex flex-1 flex-col">
            <Progress filled={1} onBack={() => setStep("welcome")} />
            <h1 className="mt-4 text-heading leading-tight font-semibold">
              {t("Tell us about your shop")}
            </h1>
            <p className="hint mt-1.5">
              {t(
                "This appears in the app and on your staff's screens. You can change it later.",
              )}
            </p>
            <div className="mt-5 space-y-4">
              <label className="field-label">
                {t("Shop name")}
                <input
                  className="field"
                  maxLength={60}
                  autoComplete="organization"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
              <label className="field-label">
                {t("What do you mostly sell?")}
                <select
                  className="field"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as ShopKind)}
                >
                  {shopKinds.map((item) => (
                    <option key={item} value={item}>
                      {t(item)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex-1" />
            {problem && (
              <div className="mt-4">
                <Alert>{problem}</Alert>
              </div>
            )}
            <button
              className="btn-accent mt-4 w-full"
              disabled={busy || !name.trim()}
            >
              {t("Continue")}
            </button>
          </form>
        )}

        {step === "products" && (
          <div className="flex flex-1 flex-col">
            <Progress filled={2} onBack={() => setStep("shop")} />
            <h1 className="mt-4 text-heading leading-tight font-semibold">
              {t("Add your first products")}
            </h1>
            <p className="hint mt-1.5">
              {t("Start small. You can add the rest any time.")}
            </p>
            <div className="mt-5 grid gap-2.5">
              <Choice
                title={t("Add a few by hand")}
                detail={t("Name, stock and price. About a minute each.")}
                chosen={start === "hand"}
                onChoose={() => setStart("hand")}
              />
              <Choice
                title={t("Import a spreadsheet")}
                detail={t("Best if you already have a product list.")}
                chosen={start === "csv"}
                onChoose={() => setStart("csv")}
              />
              <Choice
                title={t("Explore with sample products")}
                detail={t("Try it safely. Remove them in one tap.")}
                chosen={start === "sample"}
                onChoose={() => setStart("sample")}
              />
            </div>
            {start === "hand" && (
              <div className="mt-4 space-y-3">
                {added.length > 0 && (
                  <p className="hint">
                    {t("Added")}: {added.join(", ")}
                  </p>
                )}
                <label className="field-label">
                  {t("Product name")}
                  <input
                    className="field"
                    maxLength={100}
                    value={product.name}
                    onChange={(event) =>
                      setProduct({ ...product, name: event.target.value })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="field-label">
                    {t("In stock")}
                    <input
                      className="field"
                      inputMode="numeric"
                      value={product.stock}
                      onChange={(event) =>
                        setProduct({ ...product, stock: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-label">
                    {t("Selling price, ₹")}
                    <input
                      className="field"
                      inputMode="decimal"
                      value={product.price}
                      onChange={(event) =>
                        setProduct({ ...product, price: event.target.value })
                      }
                    />
                  </label>
                </div>
                <button
                  className="btn-soft w-full"
                  disabled={busy || !product.name.trim()}
                  onClick={() => run(addProduct)}
                >
                  {t("Add another")}
                </button>
              </div>
            )}
            {start === "csv" && (
              <div className="mt-4">
                <ImportProducts
                  shop={user.uid}
                  actor={user.email ?? ""}
                  products={products}
                  onDone={() => setStep("staff")}
                  onNotice={() => {}}
                />
              </div>
            )}
            <div className="flex-1" />
            {problem && (
              <div className="mt-4">
                <Alert>{problem}</Alert>
              </div>
            )}
            <button
              className={
                start === "csv"
                  ? "btn-soft mt-4 w-full"
                  : "btn-accent mt-4 w-full"
              }
              disabled={busy}
              onClick={firstProducts}
            >
              {start === "csv" ? t("Skip for now") : t("Continue")}
            </button>
          </div>
        )}

        {step === "staff" && (
          <div className="flex flex-1 flex-col">
            <Progress
              filled={3}
              onBack={() => setStep("products")}
              action={
                <button
                  className="min-h-11 px-1 text-muted"
                  onClick={() => setStep("done")}
                >
                  {t("Skip")}
                </button>
              }
            />
            <h1 className="mt-4 text-heading leading-tight font-semibold">
              {t("Anyone helping at the counter?")}
            </h1>
            <p className="hint mt-1.5">
              {t(
                "Staff can record stock but can't change your products or prices.",
              )}
            </p>
            <section className="panel mt-5">
              <p className="hint">{t("Share this code")}</p>
              <p className="tabular mt-1.5 min-h-9 text-heading font-semibold tracking-wider">
                {invite}
              </p>
              <button
                className="btn-soft mt-3 w-full"
                disabled={!invite}
                onClick={copyInvite}
              >
                {copied ? t("Copied") : t("Copy code")}
              </button>
              <p className="hint mt-3">
                {t(
                  "They create an account, choose I work at a shop and enter it.",
                )}
              </p>
            </section>
            <div className="flex-1" />
            {problem && (
              <div className="mt-4">
                <Alert>{problem}</Alert>
              </div>
            )}
            <button
              className="btn-accent mt-4 w-full"
              onClick={() => setStep("done")}
            >
              {t("Continue")}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-1 flex-col justify-end">
            <h1 className="text-heading leading-tight font-semibold">
              {t("You're set up")}
            </h1>
            <p className="hint mt-1.5">
              {t(
                "Want a one-minute tour of the four things you'll use every day?",
              )}
            </p>
            {problem && (
              <div className="mt-4">
                <Alert>{problem}</Alert>
              </div>
            )}
            <button
              className="btn-accent mt-5 w-full"
              disabled={busy}
              onClick={() => finish(true)}
            >
              {t("Show me around")}
            </button>
            <button
              className="btn-soft mt-2.5 w-full"
              disabled={busy}
              onClick={() => finish(false)}
            >
              {t("Skip the tour")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
