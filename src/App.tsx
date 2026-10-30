import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { auth, configured, db } from "./firebase";
import {
  inventorySummary,
  statusOf,
  subscribeToProducts,
  type Product,
} from "./inventory";
import { AuthScreen } from "./AuthScreen";
import { ProductDialog, type Dialog } from "./ProductDialog";
import { Banner, Brand, EmptyState, Metric, StatusBadge } from "./ui";

function AppShell({ user }: { user: User }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState<"dashboard" | "inventory">("dashboard");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [mobileMenu, setMobileMenu] = useState(false);
  const summary = useMemo(() => inventorySummary(products), [products]);
  const categories = useMemo(
    () => [
      "All categories",
      ...new Set(products.map((product) => product.category).sort()),
    ],
    [products],
  );
  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "All categories" || product.category === category) &&
          `${product.name} ${product.sku}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()),
      ),
    [products, category, search],
  );
  const needsAttention = products.filter(
    (product) => statusOf(product) !== "healthy",
  );

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
        setLoadError(`Unable to load inventory: ${message}`);
        setLoading(false);
      },
    );
  }, [user.uid]);

  function navigate(next: "dashboard" | "inventory") {
    setPage(next);
    setMobileMenu(false);
    setNotice("");
  }
  const nav = (
    <>
      <button
        className={`nav-link ${page === "dashboard" ? "nav-active" : ""}`}
        onClick={() => navigate("dashboard")}
      >
        <LayoutDashboard size={18} />
        Dashboard
      </button>
      <button
        className={`nav-link ${page === "inventory" ? "nav-active" : ""}`}
        onClick={() => navigate("inventory")}
      >
        <Package size={18} />
        Inventory
      </button>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-slate-900 lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-7 lg:flex">
        <div className="px-3">
          <Brand small />
        </div>
        <div className="mt-12 space-y-1">{nav}</div>
        <div className="mt-auto rounded-2xl bg-indigo-50 p-4">
          <CircleHelp size={19} className="text-indigo-600" />
          <p className="mt-3 text-sm font-semibold">A little more clarity</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Your stock updates automatically on every signed-in device.
          </p>
        </div>
        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 px-2 pt-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
            {(user.email?.[0] ?? "U").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Your workspace</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            title="Sign out"
            onClick={() => auth && signOut(auth)}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex h-18 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8 lg:hidden">
          <Brand small />
          <button
            className="icon-button"
            aria-label="Open menu"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>
        {mobileMenu && (
          <div className="border-b border-slate-200 bg-white px-5 py-3 lg:hidden">
            {nav}
            <button
              className="nav-link mt-1"
              onClick={() => auth && signOut(auth)}
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        )}
        <main className="mx-auto max-w-7xl px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="eyebrow">YOUR WORKSPACE</span>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
                {page === "dashboard" ? "Dashboard" : "Inventory"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {page === "dashboard"
                  ? "A clear picture of what is happening in your store."
                  : "Manage products and keep quantities up to date."}
              </p>
            </div>
            <button
              className="primary-button"
              onClick={() => setDialog({ kind: "create" })}
            >
              <Plus size={18} />
              Add product
            </button>
          </div>
          {notice && (
            <div className="mb-5">
              <Banner tone="success">{notice}</Banner>
            </div>
          )}
          {loadError && (
            <div className="mb-5">
              <Banner>{loadError}</Banner>
            </div>
          )}
          {loading ? (
            <div className="card py-20 text-center text-slate-500">
              Loading inventory…
            </div>
          ) : page === "dashboard" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Metric
                  label="Total products"
                  value={summary.products}
                  icon={<Package size={20} />}
                  color="indigo"
                />
                <Metric
                  label="Stock units"
                  value={summary.units}
                  icon={<Boxes size={20} />}
                  color="blue"
                />
                <Metric
                  label="Low stock"
                  value={summary.low}
                  icon={<ArrowDownRight size={20} />}
                  color="amber"
                />
                <Metric
                  label="Out of stock"
                  value={summary.out}
                  icon={<AlertCircle size={20} />}
                  color="rose"
                />
              </div>
              <div className="mt-7 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2 className="section-title">Recently updated</h2>
                      <p className="section-subtitle">
                        The latest changes in your inventory
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("inventory")}
                    >
                      View all <ArrowRight size={15} />
                    </button>
                  </div>
                  {products.length ? (
                    <div className="divide-y divide-slate-100">
                      {products.slice(0, 5).map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 py-4"
                        >
                          <span className="product-icon">
                            <Package size={18} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {product.category}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">
                              {product.quantity} units
                            </p>
                            <StatusBadge product={product} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState onAdd={() => setDialog({ kind: "create" })} />
                  )}
                </section>
                <section className="card">
                  <div className="section-heading">
                    <div>
                      <h2 className="section-title">Needs attention</h2>
                      <p className="section-subtitle">
                        Products running low or sold out
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                      {needsAttention.length}
                    </span>
                  </div>
                  {needsAttention.length ? (
                    <div className="space-y-3">
                      {needsAttention.slice(0, 5).map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
                        >
                          <span className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                            <AlertCircle size={17} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {product.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {product.quantity} units left
                            </p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() =>
                              setDialog({ kind: "adjust", product })
                            }
                          >
                            Restock
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-10 text-center">
                      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check size={22} />
                      </span>
                      <p className="mt-3 text-sm font-semibold">
                        All stocked up
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        No products need attention right now.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <section className="card !p-0">
              <div className="flex flex-wrap gap-3 border-b border-slate-100 p-5 sm:p-6">
                <div className="relative min-w-52 flex-1">
                  <Search
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    className="field !pl-10"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search products or SKU"
                    aria-label="Search products"
                  />
                </div>
                <div className="relative">
                  <select
                    className="field appearance-none !pr-10"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    aria-label="Filter by category"
                  >
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                </div>
              </div>
              {products.length === 0 ? (
                <EmptyState onAdd={() => setDialog({ kind: "create" })} />
              ) : visible.length === 0 ? (
                <div className="py-20 text-center text-sm text-slate-500">
                  No products match your search.
                </div>
              ) : (
                <>
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-6 py-4">Product</th>
                          <th className="px-6 py-4">Category</th>
                          <th className="px-6 py-4">Quantity</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visible.map((product) => (
                          <tr key={product.id} className="hover:bg-slate-50/70">
                            <td className="px-6 py-4">
                              <p className="font-semibold">{product.name}</p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {product.sku || "No SKU"}
                              </p>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {product.category}
                            </td>
                            <td className="px-6 py-4 font-semibold">
                              {product.quantity}
                            </td>
                            <td className="px-6 py-4">
                              <StatusBadge product={product} />
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-end gap-1">
                                <button
                                  className="table-action"
                                  title="Adjust stock"
                                  aria-label={`Adjust stock for ${product.name}`}
                                  onClick={() =>
                                    setDialog({ kind: "adjust", product })
                                  }
                                >
                                  <ArrowUpRight size={17} />
                                </button>
                                <button
                                  className="table-action"
                                  title="Edit product"
                                  aria-label={`Edit ${product.name}`}
                                  onClick={() =>
                                    setDialog({ kind: "edit", product })
                                  }
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="table-action hover:!text-rose-600"
                                  title="Delete product"
                                  aria-label={`Delete ${product.name}`}
                                  onClick={() =>
                                    setDialog({ kind: "delete", product })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="divide-y divide-slate-100 md:hidden">
                    {visible.map((product) => (
                      <div key={product.id} className="p-5">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-semibold">{product.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {product.category} · {product.sku || "No SKU"}
                            </p>
                          </div>
                          <StatusBadge product={product} />
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-sm font-semibold">
                            {product.quantity} units
                          </span>
                          <div className="flex gap-1">
                            <button
                              className="table-action"
                              aria-label={`Adjust stock for ${product.name}`}
                              onClick={() =>
                                setDialog({ kind: "adjust", product })
                              }
                            >
                              <ArrowUpRight size={17} />
                            </button>
                            <button
                              className="table-action"
                              aria-label={`Edit ${product.name}`}
                              onClick={() =>
                                setDialog({ kind: "edit", product })
                              }
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="table-action"
                              aria-label={`Delete ${product.name}`}
                              onClick={() =>
                                setDialog({ kind: "delete", product })
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}
        </main>
      </div>
      {dialog && (
        <ProductDialog
          key={`${dialog.kind}-${"product" in dialog ? dialog.product.id : "new"}`}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSuccess={setNotice}
        />
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
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="card max-w-lg">
          <Brand />
          <h1 className="mt-8 text-2xl font-bold">
            Connect Firebase to continue
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Create a Firebase project, enable Email/Password Authentication and
            Cloud Firestore, then copy <code>.env.example</code> to{" "}
            <code>.env</code> and fill in the four web app settings. Restart the
            development server afterward.
          </p>
          <p className="mt-5 text-xs text-slate-400">
            See README.md for setup steps.
          </p>
        </div>
      </div>
    );
  if (checking)
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Connecting to StockSync…
      </div>
    );
  return user ? <AppShell user={user} /> : <AuthScreen />;
}
