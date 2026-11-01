import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { currentLanguage, t } from "./i18n";
import raw from "./data/retail-insights.json";

type Week = { week: string; actual: number; predicted: number; baseline: number };
type ProductInsight = {
  code: string;
  name: string;
  trainingUnits: number;
  nextWeekEstimate: number;
  weeks: Week[];
};
type InsightsData = {
  version: number;
  source: { name: string; url: string; sha256: string; country: string; currency: string };
  period: { firstWeek: string; lastWeek: string; lastObservedDate: string; trainingEnd: string; holdoutStart: string; holdoutWeeks: number; illustrativeNextWeek: string };
  cleaning: { rawRows: number; completeWeekRows: number };
  model: { name: string; trainRows: number; testRows: number; productCount: number };
  metrics: { model: { mae: number; rmse: number; r2: number }; baseline: { mae: number; rmse: number; r2: number } };
  products: ProductInsight[];
};

const data: InsightsData = raw;
const number = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 1 });
const metric = (value: number) => value.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const date = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString(currentLanguage() === "hi" ? "hi-IN" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function DemandChart({ weeks }: { weeks: Week[] }) {
  const top = Math.max(1, ...weeks.flatMap((row) => [row.actual, row.predicted, row.baseline]));
  const point = (value: number, index: number) => `${(index / Math.max(weeks.length - 1, 1)) * 100},${80 - (value / top) * 72}`;
  const line = (field: "actual" | "predicted" | "baseline") => weeks.map((row, index) => point(row[field], index)).join(" ");
  return (
    <div>
      <div className="hint mb-3 flex flex-wrap gap-x-5 gap-y-1">
        <span><span className="mr-1.5 inline-block size-2 rounded-full bg-accent" />{t("Actual sales")}</span>
        <span><span className="mr-1.5 inline-block size-2 rounded-full bg-[#e9bb84]" />{t("Model prediction")}</span>
        <span><span className="mr-1.5 inline-block size-2 rounded-full bg-muted" />{t("Previous-week baseline")}</span>
      </div>
      <svg viewBox="-2 0 104 84" className="h-56 w-full overflow-visible" role="img" aria-label={t("Actual sales, model prediction and baseline for the twelve test weeks")}>
        <line x1="0" x2="100" y1="80" y2="80" stroke="#383b42" strokeWidth="0.4" />
        <line x1="0" x2="100" y1="44" y2="44" stroke="#383b42" strokeWidth="0.25" strokeDasharray="1 1" />
        <polyline points={line("baseline")} fill="none" stroke="#9299a5" strokeWidth="0.7" strokeDasharray="1.2 1.2" vectorEffect="non-scaling-stroke" />
        <polyline points={line("predicted")} fill="none" stroke="#e9bb84" strokeWidth="0.85" vectorEffect="non-scaling-stroke" />
        <polyline points={line("actual")} fill="none" stroke="#8ab8ff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="hint flex justify-between"><span>{date(weeks[0].week)}</span><span>{date(weeks[weeks.length - 1].week)}</span></div>
    </div>
  );
}

export function InsightsPage({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState(data.products[0]?.code ?? "");
  const product = data.products.find((item) => item.code === code);
  return (
    <div className="space-y-gap">
      <button className="btn-link inline-flex items-center gap-2" onClick={onBack}>
        <ArrowLeft size={16} />{t("Back to Overview")}
      </button>
      <section className="panel">
        <p className="text-caption font-medium uppercase tracking-wide text-accent">{t("SDA dataset demonstration")}</p>
        <h2 className="mt-2 text-heading font-semibold">{t("Retail demand insights")}</h2>
        <p className="hint mt-2 max-w-2xl">
          {t("These are historical UK giftware sales from 2009–2011. They are not forecasts for your shop or its products.")}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-caption">
          <span>{t("Source")}: <a className="text-accent underline" href={data.source.url} target="_blank" rel="noreferrer">UCI Online Retail II <ExternalLink size={12} className="inline" /></a></span>
          <span>{t("Training data")}: {date(data.period.firstWeek)} – {date(data.period.trainingEnd)}</span>
          <span>{t("Test period")}: {date(data.period.holdoutStart)} – {date(data.period.lastObservedDate)}</span>
        </div>
      </section>

      <section className="panel">
        <h2 className="heading">{t("Measured model performance")}</h2>
        <p className="hint mt-1">{t("Last 12 complete weeks, held out from training. Lower MAE and RMSE are better; higher R² is better.")}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[340px] text-left text-caption tabular">
            <thead className="text-muted"><tr><th scope="col" className="pb-2 font-medium">{t("Method")}</th><th scope="col" className="pb-2 text-right font-medium">MAE</th><th scope="col" className="pb-2 text-right font-medium">RMSE</th><th scope="col" className="pb-2 text-right font-medium">R²</th></tr></thead>
            <tbody className="divide-y divide-line">
              {([ [t("Random Forest"), data.metrics.model], [t("Previous-week baseline"), data.metrics.baseline] ] as const).map(([label, values]) => <tr key={label}><th scope="row" className="py-2 font-medium">{label}</th><td className="py-2 text-right">{metric(values.mae)}</td><td className="py-2 text-right">{metric(values.rmse)}</td><td className="py-2 text-right">{metric(values.r2)}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="hint mt-3">{t("Errors are in units sold per product per week, across all 50 selected products.")}</p>
      </section>

      {product ? (
        <section className="panel">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="heading">{t("Product demand")}</h2>
              <p className="hint mt-1">{t("Choose a product to inspect its held-out predictions.")}</p>
            </div>
            <label className="min-w-0 w-full text-caption font-medium md:w-auto">
              <span className="sr-only">{t("Dataset product")}</span>
              <select className="input w-full md:max-w-[22rem]" value={code} onChange={(event) => setCode(event.target.value)}>
                {data.products.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
              </select>
            </label>
          </div>
          <div className="mt-5 grid gap-gap md:grid-cols-[minmax(0,1fr)_12rem]">
            <DemandChart weeks={product.weeks} />
            <div className="rounded-control bg-raised p-4">
              <p className="hint">{t("Illustrative next week")}</p>
              <p className="mt-1 text-heading font-semibold tabular">{number(product.nextWeekEstimate)} {t("units")}</p>
              <p className="hint mt-2">{t("Estimate as of")} {date(data.period.lastObservedDate)}. {t("This is not a current stock recommendation.")}</p>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-caption tabular">
              <thead className="text-muted"><tr><th scope="col" className="pb-2 font-medium">{t("Week starting")}</th><th scope="col" className="pb-2 text-right font-medium">{t("Actual sales")}</th><th scope="col" className="pb-2 text-right font-medium">{t("Model prediction")}</th><th scope="col" className="pb-2 text-right font-medium">{t("Baseline")}</th></tr></thead>
              <tbody className="divide-y divide-line">{product.weeks.map((week) => <tr key={week.week}><th scope="row" className="py-2 font-medium">{date(week.week)}</th><td className="py-2 text-right">{number(week.actual)}</td><td className="py-2 text-right">{number(week.predicted)}</td><td className="py-2 text-right">{number(week.baseline)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : <section className="panel"><p>{t("No dataset products are available.")}</p></section>}

      <section className="panel">
        <h2 className="heading">{t("About this analysis")}</h2>
        <p className="hint mt-2">{t("The model learned from earlier weekly sales of 50 products. The last 12 weeks were reserved for testing. Historical sales cannot reveal how much stock was available, and these UK giftware products do not match this shop's inventory.")}</p>
        <p className="hint mt-2">{number(data.cleaning.rawRows)} {t("source rows")}; {number(data.cleaning.completeWeekRows)} {t("cleaned rows in complete weeks")}; {number(data.model.trainRows)} {t("training product-weeks")}; {number(data.model.testRows)} {t("test product-weeks")}.</p>
      </section>
    </div>
  );
}
