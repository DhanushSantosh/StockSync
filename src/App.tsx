import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  ClipboardList,
  CloudOff,
  History,
  LayoutDashboard,
  Package,
  Plus,
  ReceiptText,
  Settings,
} from "lucide-react";
import { errorText } from "./display";
import { onSyncFailure } from "./firestoreWrites";
import { subscribeToCustomers, type Customer } from "./credit";
import {
  forgetShop,
  subscribeToMembership,
  subscribeToProfile,
  type ShopProfile,
} from "./shop";
import { auth, configured, db } from "./firebase";
import {
  statusOf,
  subscribeToMovements,
  subscribeToProducts,
  subscribeToRecentMovements,
  type Movement,
  type Product,
} from "./inventory";
import type { Panel } from "./Sheet";
import { Alert } from "./ui";
import { VerifyEmail } from "./VerifyEmail";
import { t } from "./i18n";

const AuthScreen = lazy(() =>
  import("./AuthScreen").then((file) => ({ default: file.AuthScreen })),
);
const HistoryPage = lazy(() =>
  import("./HistoryPage").then((file) => ({ default: file.HistoryPage })),
);
const OverviewPage = lazy(() =>
  import("./OverviewPage").then((file) => ({ default: file.OverviewPage })),
);
const ProductsPage = lazy(() =>
  import("./ProductsPage").then((file) => ({ default: file.ProductsPage })),
);
const RecordPage = lazy(() =>
  import("./RecordPage").then((file) => ({ default: file.RecordPage })),
);
const ReorderPage = lazy(() =>
  import("./ReorderPage").then((file) => ({ default: file.ReorderPage })),
);
const GettingStarted = lazy(() =>
  import("./GettingStarted").then((file) => ({ default: file.GettingStarted })),
);
const Setup = lazy(() =>
  import("./Setup").then((file) => ({ default: file.Setup })),
);
const Tour = lazy(() =>
  import("./Tour").then((file) => ({ default: file.Tour })),
);
const Sheet = lazy(() =>
  import("./Sheet").then((file) => ({ default: file.Sheet })),
);

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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shop, setShopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [notice, setNotice] = useState("");
  const [historySize, setHistorySize] = useState(50);
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
  const canManage = shop === user.uid;
  const importProducts = () => setPanel({ kind: "import" });
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [profile, setProfile] = useState<ShopProfile | null>(null);
  const [employer, setEmployer] = useState<ShopProfile>({});
  const [movementsLoaded, setMovementsLoaded] = useState(false);
  const [settingUp, setSettingUp] = useState(false);
  const [setupFinished, setSetupFinished] = useState(false);
  const [touring, setTouring] = useState(false);
  const shopName = (canManage ? profile : employer)?.name;

  // New accounts only: anyone with stock or history is already running a shop.
  const isNew =
    canManage &&
    !loading &&
    movementsLoaded &&
    !!profile &&
    !profile.setupDone &&
    products.length === 0 &&
    movements.length === 0;
  if (isNew && !settingUp) setSettingUp(true);

  function finishSetup(tour: boolean) {
    setSetupFinished(true);
    setTouring(tour);
  }

  function openStep(step: number) {
    if (step === 0) add();
    else if (step === 2) setPage("Products");
    else setPage("Record");
  }

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
    return subscribeToMembership(db, user.uid, (owner) => {
      const id = owner ?? user.uid;
      setShopId(id);
    });
  }, [user.uid, user.email]);

  useEffect(() => {
    if (!db) return;
    return subscribeToProfile(db, user.uid, setProfile);
  }, [user.uid]);

  useEffect(() => {
    if (!db || !shop || shop === user.uid) return;
    return subscribeToProfile(db, shop, setEmployer);
  }, [shop, user.uid]);

  useEffect(() => {
    if (!db || !shop) return;
    return subscribeToCustomers(db, shop, setCustomers, () => {});
  }, [shop]);

  useEffect(() => {
    if (!db || !shop) return;
    return subscribeToProducts(
      db,
      shop,
      (items) => {
        setProducts(items);
        setLoading(false);
        setLoadError("");
      },
      (message) => {
        // A removed staff member falls back to their own shop.
        if (db && shop !== user.uid) forgetShop(db, user.uid);
        else setLoadError(`Inventory failed to load: ${message}`);
        setLoading(false);
      },
    );
  }, [shop, user.uid]);

  useEffect(() => {
    if (!db || !shop) return;
    const onError = (message: string) =>
      setActivityError(`Stock changes failed to load: ${message}`);
    const stopList = subscribeToMovements(
      db,
      shop,
      historySize,
      (items) => {
        setMovements(items);
        setMovementsLoaded(true);
        setActivityError("");
      },
      (message) => {
        setMovementsLoaded(true);
        onError(message);
      },
    );
    const stopChart = subscribeToRecentMovements(
      db,
      shop,
      14,
      setRecentMovements,
      onError,
    );
    return () => {
      stopList();
      stopChart();
    };
  }, [shop, historySize]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const content = useRef<HTMLElement>(null);
  const firstPage = useRef(true);
  useEffect(() => {
    document.title = `${page} | StockSync`;
    // Move assistive tech to the new page, without doing so on first load.
    if (firstPage.current) firstPage.current = false;
    else content.current?.focus({ preventScroll: true });
  }, [page]);

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

  if (settingUp && !setupFinished && profile)
    return (
      <Suspense fallback={<div className="min-h-dvh bg-ink" />}>
        <Setup
          user={user}
          profile={profile}
          products={products}
          onDone={finishSetup}
        />
      </Suspense>
    );

  return (
    <div className="mx-auto max-w-[1240px] px-gutter pt-[env(safe-area-inset-top)] pb-[calc(var(--tabbar)+0.5rem)] md:pb-10">
      <a
        href="#content"
        className="btn-accent fixed top-2 left-2 z-[70] -translate-y-24 focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="flex min-h-12 flex-wrap items-center gap-1.5 md:min-h-[72px] md:gap-3">
        <span className="min-w-0 truncate text-title font-semibold tracking-tight md:max-w-64">
          {shopName || "StockSync"}
        </span>
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
              data-tour={item}
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              {t(item)}
              {item === "Reorder" && attention > 0 && (
                <span className="tabular ml-1.5 text-accent">{attention}</span>
              )}
            </button>
          ))}
        </nav>
        {canManage && (
          <button
            className="btn-accent max-md:ml-auto max-md:!min-h-11 max-md:size-11 max-md:!p-0"
            aria-label={t("Add product")}
            onClick={add}
          >
            <Plus size={16} />
            <span className="max-md:hidden">{t("Add product")}</span>
          </button>
        )}
        <button
          className={`flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-panel hover:text-fg ${canManage ? "" : "max-md:ml-auto"}`}
          aria-label={t("Settings")}
          title={t("Settings")}
          onClick={() => setPanel({ kind: "settings" })}
        >
          <Settings size={18} />
        </button>
      </header>
      <main id="content" ref={content} tabIndex={-1} className="outline-none">
        {offline && (
          <p className="page mb-4 flex items-center gap-2 rounded-control bg-warn/10 px-3.5 py-2.5 text-warn">
            <CloudOff size={16} className="shrink-0" />
            {t(
              "You're offline. Changes are saved on this device and sync when you're back.",
            )}
          </p>
        )}
        {loadError && (
          <div className="mb-4">
            <Alert>{loadError}</Alert>
          </div>
        )}
        {loading || !shop || !profile || !movementsLoaded ? (
          <div className="grid gap-gap md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <div className="skeleton h-[26rem]" />
            <div className="skeleton h-[26rem]" />
          </div>
        ) : (
          <Suspense fallback={<div className="skeleton h-[26rem]" />}>
            <div key={page} className="page">
              {page !== "Overview" && (
                <h1 className="mb-gap text-heading font-semibold">{t(page)}</h1>
              )}
              {page === "Overview" && canManage && profile.setupDone && (
                <GettingStarted
                  shop={shop}
                  products={products}
                  movements={movements}
                  hidden={!!profile.checklistHidden}
                  onNotice={setNotice}
                  onStep={openStep}
                />
              )}
              {page === "Overview" ? (
                <OverviewPage
                  products={products}
                  movements={movements}
                  recentMovements={recentMovements}
                  customers={customers}
                  canManage={canManage}
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
                  canManage={canManage}
                />
              ) : page === "Record" ? (
                <RecordPage
                  shop={shop}
                  actor={user.email ?? ""}
                  products={products}
                  customers={customers}
                  onNotice={setNotice}
                />
              ) : page === "Reorder" ? (
                <ReorderPage
                  shop={shop}
                  actor={user.email ?? ""}
                  products={products}
                  onSelect={select}
                  onNotice={setNotice}
                />
              ) : (
                <HistoryPage
                  shop={shop}
                  actor={user.email ?? ""}
                  movements={movements}
                  error={activityError}
                  hasMore={movements.length >= historySize}
                  onLoadMore={() => setHistorySize(historySize + 50)}
                  onNotice={setNotice}
                />
              )}
            </div>
          </Suspense>
        )}
      </main>
      <nav className="tabbar" aria-label="Main">
        {pages.map((item) => {
          const Icon = tabIcons[item];
          return (
            <button
              key={item}
              className="tab"
              data-tour={item}
              aria-current={page === item ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              {item === "Record" ? (
                <>
                  <span className="tab-main">
                    <Icon size={19} />
                  </span>
                  <span className="tab-label">{t(item)}</span>
                </>
              ) : (
                <>
                  <Icon size={21} />
                  <span className="tab-label">{t(item)}</span>
                  {item === "Reorder" && attention > 0 && (
                    <span className="tab-count">{attention}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>
      {panel && shop && (
        <Suspense fallback={null}>
          <Sheet
            shop={shop}
            actor={user.email ?? ""}
            key={"id" in panel ? panel.id : panel.kind}
            panel={panel}
            products={products}
            canManage={canManage}
            shopName={shopName ?? ""}
            onTour={() => setTouring(true)}
            onPanel={setPanel}
            onClose={() => setPanel(null)}
            onNotice={setNotice}
          />
        </Suspense>
      )}
      {touring && (
        <Suspense fallback={null}>
          <Tour onClose={() => setTouring(false)} />
        </Suspense>
      )}
      <div role="status" aria-live="polite">
        {notice && (
          <div key={notice} className="toast">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [confirmed, setConfirmed] = useState(0);
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
          <h1 className="text-heading font-semibold">Connect Firebase</h1>
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
  if (!user)
    return (
      <Suspense fallback={<div className="min-h-dvh bg-ink" />}>
        <AuthScreen />
      </Suspense>
    );
  if (!user.emailVerified)
    return (
      <VerifyEmail user={user} onVerified={() => setConfirmed(confirmed + 1)} />
    );
  // Keyed so nothing from one account carries into the next.
  return <AppShell key={user.uid} user={user} />;
}
