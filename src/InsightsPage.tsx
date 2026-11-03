import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { currentLanguage, t } from "./i18n";
import raw from "./data/retail-insights.json";
import demo from "./data/demo-insights.json";

type Week = {
  week: string;
  actual: number;
  predicted: number;
  baseline: number;
};
type ProductInsight = {
  code: string;
  name: string;
  trainingUnits: number;
  nextWeekEstimate: number;
  weeks: Week[];
};
type InsightsData = {
  version: number;
  source: {
    name: string;
    url: string;
    sha256: string;
    country: string;
    currency: string;
  };
  period: {
    firstWeek: string;
    lastWeek: string;
    lastObservedDate: string;
    trainingEnd: string;
    holdoutStart: string;
    holdoutWeeks: number;
    illustrativeNextWeek: string;
  };
  cleaning: { rawRows: number; completeWeekRows: number };
  model: {
    name: string;
    trainRows: number;
    testRows: number;
    productCount: number;
  };
  metrics: {
    model: { mae: number; rmse: number; r2: number };
    baseline: { mae: number; rmse: number; r2: number };
  };
  products: ProductInsight[];
};

const data: InsightsData = raw;
const number = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const metric = (value: number) =>
  value.toLocaleString("en-IN", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
const date = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString(
    currentLanguage() === "hi" ? "hi-IN" : "en-GB",
    { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" },
  );

function DemandChart({ weeks }: { weeks: Week[] }) {
  const top = Math.max(
    1,
    ...weeks.flatMap((row) => [row.actual, row.predicted]),
  );
  const point = (value: number, index: number) =>
    `${(index / Math.max(weeks.length - 1, 1)) * 100},${80 - (value / top) * 72}`;
  const line = (field: "actual" | "predicted") =>
    weeks.map((row, index) => point(row[field], index)).join(" ");
  return (
    <div>
      <div className="hint mb-3 flex flex-wrap gap-x-5 gap-y-1">
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-accent" />
          {t("Past sales")}
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2 rounded-full bg-[#e9bb84]" />
          {t("Estimated sales")}
        </span>
      </div>
      <svg
        viewBox="-2 0 104 84"
        className="h-56 w-full overflow-visible"
        role="img"
        aria-label={t("Past and estimated sales")}
      >
        <line
          x1="0"
          x2="100"
          y1="80"
          y2="80"
          stroke="#383b42"
          strokeWidth="0.4"
        />
        <line
          x1="0"
          x2="100"
          y1="44"
          y2="44"
          stroke="#383b42"
          strokeWidth="0.25"
          strokeDasharray="1 1"
        />
        <polyline
          points={line("predicted")}
          fill="none"
          stroke="#e9bb84"
          strokeWidth="0.85"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line("actual")}
          fill="none"
          stroke="#8ab8ff"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="hint flex justify-between">
        <span>{date(weeks[0].week)}</span>
        <span>{date(weeks[weeks.length - 1].week)}</span>
      </div>
    </div>
  );
}

function ProductPicker({
  code,
  onChange,
  products = data.products,
}: {
  code: string;
  onChange: (code: string) => void;
  products?: ProductInsight[];
}) {
  return (
    <label className="min-w-0 w-full text-caption font-medium md:w-auto">
      <span className="sr-only">{t("Sample product")}</span>
      <select
        className="input w-full md:max-w-[22rem]"
        value={code}
        onChange={(event) => onChange(event.target.value)}
      >
        {products.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name} ({item.code})
          </option>
        ))}
      </select>
    </label>
  );
}

export function InsightsPage({
  code,
  onCodeChange,
  onBack,
  onDetails,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  onBack: () => void;
  onDetails: () => void;
}) {
  const [demoCode, setDemoCode] = useState(demo.products[0]?.code ?? "");
  const demoProduct = demo.products.find((item) => item.code === demoCode);
  const selectedCode = code || data.products[0]?.code || "";
  const product = data.products.find((item) => item.code === selectedCode);
  return (
    <div className="space-y-gap">
      <button
        className="btn-link inline-flex items-center gap-2"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        {t("Back to Overview")}
      </button>
      <section className="panel">
        <h2 className="heading">{t("Explore demand by product")}</h2>
        <p className="hint mt-2">
          {t("Explore a generated grocery demo and a separate historical retail study. Neither predicts your shop's sales.")}
        </p>
      </section>
      {demoProduct && (
        <section className="panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="heading">{t("Sample grocery shop")}</h2>
              <p className="hint mt-1">{t("Generated practice sales, not your shop's records.")}</p>
            </div>
            <ProductPicker code={demoCode} onChange={setDemoCode} products={demo.products} />
          </div>
          <div className="mt-5 grid gap-gap md:grid-cols-[minmax(0,1fr)_12rem]">
            <DemandChart weeks={demoProduct.weeks} />
            <div className="rounded-control bg-raised p-4">
              <p className="hint">{t("Estimated sales for the next week")}</p>
              <p className="mt-1 text-heading font-semibold tabular">
                {t("About")} {number(Math.round(demoProduct.nextWeekEstimate))} {t("units")}
              </p>
              <p className="hint mt-2">
                {t("Week of")} {date(demo.period.illustrativeNextWeek)}. {t("Generated example only; not a current stock recommendation.")}
              </p>
            </div>
          </div>
        </section>
      )}
      {product ? (
        <section className="panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="heading">{t("Historical retail study")}</h2>
              <p className="hint mt-1">
                {t("UK giftware sales from 2009–2011; unrelated to your shop.")}
              </p>
            </div>
            <ProductPicker code={selectedCode} onChange={onCodeChange} />
          </div>
          <div className="mt-5 grid gap-gap md:grid-cols-[minmax(0,1fr)_12rem]">
            <DemandChart weeks={product.weeks} />
            <div className="rounded-control bg-raised p-4">
              <p className="hint">{t("Estimated sales for the next week")}</p>
              <p className="mt-1 text-heading font-semibold tabular">
                {t("About")} {number(Math.round(product.nextWeekEstimate))}{" "}
                {t("units")}
              </p>
              <p className="hint mt-2">
                {t("Week of")} {date(data.period.illustrativeNextWeek)}.{" "}
                {t(
                  "Historical example only; not a current stock recommendation.",
                )}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="panel">
          <p>{t("No dataset products are available.")}</p>
        </section>
      )}
      <section className="panel flex flex-wrap items-center justify-between gap-3">
        <p className="hint max-w-xl">
          {t(
            "Want to see the data source, testing results and method behind these estimates?",
          )}
        </p>
        <button className="btn-link" onClick={onDetails}>
          {t("How estimates were made")}
        </button>
      </section>
    </div>
  );
}

export function InsightsDetailsPage({
  code,
  onCodeChange,
  onBack,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  onBack: () => void;
}) {
  const selectedCode = code || data.products[0]?.code || "";
  const product = data.products.find((item) => item.code === selectedCode);
  return (
    <div className="space-y-gap">
      <button
        className="btn-link inline-flex items-center gap-2"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        {t("Back to Insights")}
      </button>
      <section className="panel">
        <h2 className="heading">{t("Dataset and method")}</h2>
        <p className="hint mt-2">
          {t(
            "The analysis uses historical UK giftware sales from 2009–2011. It cannot reveal stock on hand and does not predict demand for this shop.",
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-caption">
          <span>
            {t("Source")}:{" "}
            <a
              className="text-accent underline"
              href={data.source.url}
              target="_blank"
              rel="noreferrer"
            >
              UCI Online Retail II <ExternalLink size={12} className="inline" />
            </a>
          </span>
          <span>
            {t("Training data")}: {date(data.period.firstWeek)} –{" "}
            {date(data.period.trainingEnd)}
          </span>
          <span>
            {t("Test period")}: {date(data.period.holdoutStart)} –{" "}
            {date(data.period.lastObservedDate)}
          </span>
        </div>
      </section>
      <section className="panel">
        <h2 className="heading">{t("Generated grocery demo")}</h2>
        <p className="hint mt-1">
          {t("The grocery example uses 52 generated weeks for ten sample products. It demonstrates the same product and sales schema, but synthetic results cannot validate performance on real shops.")}
        </p>
        <div className="mt-4 grid gap-2 text-caption sm:grid-cols-2">
          <p>{t("Test period")}: {date(demo.period.holdoutStart)} – {date(demo.period.lastObservedDate)}</p>
          <p>{t("Test product-weeks")}: {demo.model.testRows}</p>
          <p>{t("Random Forest")} MAE: {metric(demo.metrics.model.mae)} {t("units")}</p>
          <p>{t("Previous-week baseline")} MAE: {metric(demo.metrics.baseline.mae)} {t("units")}</p>
        </div>
      </section>
      <section className="panel">
        <h2 className="heading">{t("Historical retail model performance")}</h2>
        <p className="hint mt-1">
          {t(
            "Last 12 complete weeks, held out from training. Lower MAE and RMSE are better; higher R² is better.",
          )}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-caption tabular">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="pb-2 font-medium">
                  {t("Method")}
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  MAE
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  RMSE
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  R²
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(
                [
                  [t("Random Forest"), data.metrics.model],
                  [t("Previous-week baseline"), data.metrics.baseline],
                ] as const
              ).map(([label, values]) => (
                <tr key={label}>
                  <th scope="row" className="py-2 font-medium">
                    {label}
                  </th>
                  <td className="py-2 text-right">{metric(values.mae)}</td>
                  <td className="py-2 text-right">{metric(values.rmse)}</td>
                  <td className="py-2 text-right">{metric(values.r2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt-3">
          {t(
            "Errors are in units sold per product per week, across all 50 selected products.",
          )}
        </p>
      </section>
      <section className="panel">
        <h2 className="heading">{t("Weekly test results")}</h2>
        <p className="hint mt-1">
          {t("Choose a product to inspect its held-out predictions.")}
        </p>
        <div className="mt-3">
          <ProductPicker code={selectedCode} onChange={onCodeChange} />
        </div>
        {product && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-caption tabular">
              <thead className="text-muted">
                <tr>
                  <th scope="col" className="pb-2 font-medium">
                    {t("Week starting")}
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    {t("Actual sales")}
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    {t("Model prediction")}
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    {t("Baseline")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {product.weeks.map((week) => (
                  <tr key={week.week}>
                    <th scope="row" className="py-2 font-medium">
                      {date(week.week)}
                    </th>
                    <td className="py-2 text-right">{number(week.actual)}</td>
                    <td className="py-2 text-right">
                      {number(week.predicted)}
                    </td>
                    <td className="py-2 text-right">{number(week.baseline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2 className="heading">{t("About this analysis")}</h2>
        <p className="hint mt-2">
          {t(
            "The model learned from earlier weekly sales of 50 products. The last 12 weeks were reserved for testing. Historical sales cannot reveal how much stock was available, and these UK giftware products do not match this shop's inventory.",
          )}
        </p>
        <p className="hint mt-2">
          {number(data.cleaning.rawRows)} {t("source rows")};{" "}
          {number(data.cleaning.completeWeekRows)}{" "}
          {t("cleaned rows in complete weeks")}; {number(data.model.trainRows)}{" "}
          {t("training product-weeks")}; {number(data.model.testRows)}{" "}
          {t("test product-weeks")}.
        </p>
      </section>
    </div>
  );
}
