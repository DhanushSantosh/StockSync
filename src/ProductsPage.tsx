import { useMemo, useState } from "react";
import { Search, Upload } from "lucide-react";
import { shelfCapacity, statusOf, type Product } from "./inventory";
import { Status, Ticker } from "./ui";

const levelTone = {
  healthy: "!bg-accent",
  low: "!bg-warn",
  out: "!bg-loss",
};

export function ProductsPage({
  products,
  onSelect,
  onAdd,
  onImport,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
  onAdd: () => void;
  onImport: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
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
          `${product.name} ${product.sku} ${product.supplier ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase().trim()),
      ),
    [products, category, search],
  );

  return (
    <section className="panel !p-0">
      <div className="flex flex-wrap gap-2 p-pad">
        <label className="relative min-w-full flex-1 sm:min-w-48">
          <Search
            size={16}
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted"
          />
          <input
            className="field !mt-0 !pl-10"
            aria-label="Search products"
            placeholder="Search products"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select
          className="field !mt-0 !w-auto min-w-40 max-sm:flex-1"
          aria-label="Filter by category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <button className="btn-soft max-sm:flex-1" onClick={onImport}>
          <Upload size={16} />
          Import CSV
        </button>
      </div>
      {products.length === 0 ? (
        <div className="px-pad pt-8 pb-14 text-center">
          <p className="hint">No products yet.</p>
          <button className="btn-accent mt-4" onClick={onAdd}>
            Add product
          </button>
        </div>
      ) : visible.length === 0 ? (
        <p className="hint px-pad pt-8 pb-14 text-center">
          No products match this search.
        </p>
      ) : (
        <div className="pb-2">
          <div className="hint hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_5rem_6.5rem] gap-5 border-b border-line px-pad pb-2 md:grid">
            <span>Product</span>
            <span>Category</span>
            <span>Stock against target</span>
            <span className="text-right">On hand</span>
            <span className="text-right">Status</span>
          </div>
          {visible.map((product) => (
            <button
              key={product.id}
              className="btn-row grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1.5 border-b border-line px-pad py-3 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_5rem_6.5rem]"
              onClick={() => onSelect(product)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {product.name}
                </span>
                <span className="hint block truncate">
                  {product.sku || "No SKU"}
                  <span className="md:hidden">
                    {", "}
                    <Status product={product} />
                  </span>
                </span>
              </span>
              <span className="hint hidden truncate md:block">
                {product.category}
              </span>
              <span className="bar bar-thin col-span-2 row-start-2 block md:col-span-1 md:row-start-auto">
                <span
                  className={`bar-fill block ${levelTone[statusOf(product)]}`}
                  style={{
                    width: `${(product.quantity / shelfCapacity(product)) * 100}%`,
                  }}
                />
              </span>
              <span className="text-right text-title font-semibold">
                <Ticker value={product.quantity} />
              </span>
              <span className="hidden text-right md:block">
                <Status product={product} />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
