import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  ClipboardList,
  CloudOff,
  History,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  ReceiptText,
} from "lucide-react";
import { errorText } from "./display";
import { auth, configured, db } from "./firebase";
import {
  onSyncFailure,
  statusOf,
  subscribeToMovements,
  subscribeToProducts,
  subscribeToRecentMovements,
  type Movement,
  type Product,
} from "./inventory";
import { AuthScreen } from "./AuthScreen";
import { HistoryPage } from "./HistoryPage";
import { OverviewPage } from "./OverviewPage";
import { ProductsPage } from "./ProductsPage";
import { RecordPage } from "./RecordPage";
import { ReorderPage } from "./ReorderPage";
import { Sheet, type Panel } from "./Sheet";
import { Alert } from "./ui";

const pages = ["Overview", "Record", "Products", "Reorder", "History"] as const;
type Page = (typeof pages)[number];
const tabIcons = {
  Overview: LayoutDashboard,
  Record: ReceiptText,
  Products: Package,
  Reorder: ClipboardList,
  History,
};

function AppShell({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<Page>("Overview");
  const [panel, setPanel] = useState<Panel | null>(null);
  const menu = useRef<Partial<Record<Page, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const attention = products.filter(
    (product) => statusOf(product) !== "healthy",
  ).length;
  const select = (product: Product) =>
    setPanel({ kind: "stock", id: product.id });
  const add = () => setPanel({ kind: "create" });
  const importProducts = () => setPanel({ kind: "import" });
  const [offline, setOffline] = useState(() => navigator.onLine === false);

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    onSyncFailure((error) =>
      setNotice(`A saved change could not sync. ${errorText(error)}`),
    );
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!db) return;
    return subscribeToProducts(
      db,
      user.uid,
      (items) => {
        setProducts(items);
        setLoading(false);
        setLoadError("");
      },
      (message) => {
        setLoadError(`Inventory failed to load: ${message}`);
        setLoading(false);
      },
    );
  }, [user.uid]);

  useEffect(() => {
    if (!db) return;
    const onError = (message: string) =>
      setActivityError(`Stock changes failed to load: ${message}`);
    const stopList = subscribeToMovements(
      db,
      user.uid,
      (items) => {
        setMovements(items);
        setActivityError("");
      },
      onError,
    );
    const stopChart = subscribeToRecentMovements(
      db,
      user.uid,
      14,
      setRecentMovements,
      onError,
    );
    return () => {
      stopList();
      stopChart();
    };
  }, [user.uid]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const measure = () => {
      const item = menu.current[page];
      if (item) setPill({ left: item.offsetLeft, width: item.offsetWidth });
    };
    measure();
    document.fonts.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [page, attention]);

  return (
    <div className="mx-auto max-w-[1240px] px-3 pt-[env(safe-area-inset-top)] pb-[calc(var(--tabbar)+1rem)] sm:px-6 md:pb-10">
      <header className="flex h-14 items-center gap-1.5 md:h-[72px] md:gap-3">
        <span className="text-lg font-semibold tracking-tight">StockSync</span>
        <nav className="menu mx-auto max-md:hidden" aria-label="Main">
          <span
            className="menu-pill"
            style={{
              transform: `translateX(${pill.left}px)`,
              width: pill.width,
            }}
          />
          {pages.map((item) => (
            <button
              key={item}
              ref={(node) => {
                menu.current[item] = node;
              }}
              className="menu-item"
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              {item}
              {item === "Reorder" && attention > 0 && (
                <span className="tabular ml-1.5 text-accent">{attention}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          className="btn-accent max-md:ml-auto max-md:size-11 max-md:!p-0"
          aria-label="Add product"
          onClick={add}
        >
          <Plus size={16} />
          <span className="max-md:hidden">Add product</span>
        </button>
        <button
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-fg"
          aria-label="Sign out"
          title={`Sign out ${user.email ?? ""}`}
          onClick={() => auth && signOut(auth)}
        >
          <LogOut size={17} />
        </button>
      </header>
      <main>
        {offline && (
          <p className="page mb-4 flex items-center gap-2 rounded-xl bg-warn/10 px-3.5 py-2.5 text-warn">
            <CloudOff size={16} className="shrink-0" />
            You're offline. Changes are saved on this device and sync when
            you're back.
          </p>
        )}
        {loadError && (
          <div className="mb-4">
            <Alert>{loadError}</Alert>
          </div>
        )}
        {loading ? (
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <div className="skeleton h-[26rem]" />
            <div className="skeleton h-[26rem]" />
          </div>
        ) : (
          <div key={page} className="page">
            {page === "Overview" ? (
              <OverviewPage
                products={products}
                movements={movements}
                recentMovements={recentMovements}
                activityError={activityError}
                onSelect={select}
                onAdd={add}
                onImport={importProducts}
                onNavigate={setPage}
              />
            ) : page === "Products" ? (
              <ProductsPage
                products={products}
                onSelect={select}
                onAdd={add}
                onImport={importProducts}
              />
            ) : page === "Record" ? (
              <RecordPage products={products} onNotice={setNotice} />
            ) : page === "Reorder" ? (
              <ReorderPage products={products} onSelect={select} />
            ) : (
              <HistoryPage movements={movements} error={activityError} />
            )}
          </div>
        )}
      </main>
      <nav className="tabbar" aria-label="Main">
        {pages.map((item) => {
          const Icon = tabIcons[item];
          return (
            <button
              key={item}
              className="tab"
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              {item === "Record" ? (
                <>
                  <span className="tab-main">
                    <Icon size={19} />
                  </span>
                  {item}
                </>
              ) : (
                <>
                  <Icon size={21} />
                  {item}
                  {item === "Reorder" && attention > 0 && (
                    <span className="tab-count">{attention}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>
      {panel && (
        <Sheet
          key={"id" in panel ? panel.id : panel.kind}
          panel={panel}
          products={products}
          onPanel={setPanel}
          onClose={() => setPanel(null)}
          onNotice={setNotice}
        />
      )}
      {notice && (
        <div key={notice} role="status" className="toast">
          {notice}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(
      auth,
      (current) => {
        setUser(current);
        setChecking(false);
      },
      () => setChecking(false),
    );
  }, []);
  if (!configured)
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <section className="panel max-w-md !p-6">
          <h1 className="text-xl font-semibold">Connect Firebase</h1>
          <p className="hint mt-2 leading-relaxed">
            Enable Email/Password Authentication and Cloud Firestore, copy{" "}
            <code>.env.example</code> to <code>.env</code>, fill in the four
            settings, then restart the development server. README.md has the
            steps.
          </p>
        </section>
      </div>
    );
  if (checking) return <div className="min-h-dvh bg-ink" />;
  return user ? <AppShell user={user} /> : <AuthScreen />;
}
