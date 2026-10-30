import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { LogOut, Plus } from "lucide-react";
import { auth, configured, db } from "./firebase";
import {
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
import { ReorderPage } from "./ReorderPage";
import { Sheet, type Panel } from "./Sheet";
import { Alert } from "./ui";

const pages = ["Overview", "Products", "Reorder", "History"] as const;
type Page = (typeof pages)[number];

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
    const item = menu.current[page];
    if (item) setPill({ left: item.offsetLeft, width: item.offsetWidth });
  }, [page, attention]);

  return (
    <div className="mx-auto max-w-[1240px] px-3 pb-24 sm:px-6 md:pb-10">
      <header className="flex h-16 items-center gap-3 md:h-[72px]">
        <span className="text-lg font-semibold tracking-tight">StockSync</span>
        <nav
          className="menu max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:z-40 max-md:shadow-xl max-md:shadow-black/60 md:mx-auto"
          aria-label="Main"
        >
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
              className="menu-item max-md:flex-1 max-md:px-1"
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
        <button className="btn-accent max-md:ml-auto" onClick={add}>
          <Plus size={16} />
          Add product
        </button>
        <button
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-fg"
          aria-label="Sign out"
          title={`Sign out ${user.email ?? ""}`}
          onClick={() => auth && signOut(auth)}
        >
          <LogOut size={17} />
        </button>
      </header>
      <main>
        {loadError && (
          <div className="mb-4">
            <Alert>{loadError}</Alert>
          </div>
        )}
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
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
                onNavigate={setPage}
              />
            ) : page === "Products" ? (
              <ProductsPage products={products} onSelect={select} onAdd={add} />
            ) : page === "Reorder" ? (
              <ReorderPage products={products} onSelect={select} />
            ) : (
              <HistoryPage movements={movements} error={activityError} />
            )}
          </div>
        )}
      </main>
      {panel && (
        <Sheet
          key={panel.kind === "create" ? "create" : panel.id}
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
