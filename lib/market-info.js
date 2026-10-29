// Earnings and dividend calendars, news, financial statements and key stats. Nasdaq's public API
// for US stocks; Cointelegraph's and Decrypt's RSS feeds for crypto headlines.
import { getJson, cached, NQ, resolve } from "./providers.js";
import { cryptoPair } from "./asset-info.js";
import { loadCryptoFeeds, selectCryptoNews } from "./news-feeds.js";
export { parseRss } from "./news-feeds.js";

const OFFLINE = process.env.QT_OFFLINE === "1";
const num = (s) => {
  const v = parseFloat(String(s ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(v) ? v : null;
};
const ymd = (d) => d.toISOString().slice(0, 10);

// The next n weekdays starting today (UTC).
function weekdays(n) {
  const out = [];
  const d = new Date();
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(ymd(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function earnings(days = 5) {
  if (OFFLINE) return [];
  const dates = weekdays(Math.min(10, Math.max(1, days)));
  const perDay = await Promise.all(
    dates.map((date) =>
      cached(`earnings:${date}`, 30 * 60e3, async () => {
        const j = await getJson(
          `https://api.nasdaq.com/api/calendar/earnings?date=${date}`,
          NQ,
        );
        return (j?.data?.rows || []).map((r) => ({
          date,
          symbol: `US:${r.symbol}`,
          ticker: r.symbol,
          name: r.name,
          when:
            r.time === "time-pre-market"
              ? "Before the open"
              : r.time === "time-after-hours"
                ? "After the close"
                : "Time not given",
          marketCap: num(r.marketCap),
          epsForecast: r.epsForecast || "",
          quarter: r.fiscalQuarterEnding || "",
          lastYearEps: r.lastYearEPS || "",
        }));
      }).catch(() => []),
    ),
  );
  return perDay.flat();
}

export async function dividends(days = 5) {
  if (OFFLINE) return [];
  const dates = weekdays(Math.min(10, Math.max(1, days)));
  const perDay = await Promise.all(
    dates.map((date) =>
      cached(`dividends:${date}`, 30 * 60e3, async () => {
        const j = await getJson(
          `https://api.nasdaq.com/api/calendar/dividends?date=${date}`,
          NQ,
        );
        return (j?.data?.calendar?.rows || []).map((r) => ({
          date,
          symbol: `US:${r.symbol}`,
          ticker: r.symbol,
          name: r.companyName,
          exDate: r.dividend_Ex_Date,
          payDate: r.payment_Date,
          recordDate: r.record_Date,
          amount: r.dividend_Rate,
          annual: r.indicated_Annual_Dividend,
        }));
      }).catch(() => []),
    ),
  );
  return perDay.flat();
}

// ---------- news ----------
export async function news(symbol) {
  if (OFFLINE) return { items: [], note: "No headlines in offline mode.", scope: "none", sources: [], updatedAt: Date.now(), refreshSeconds: 120 };
  const sym = await resolve(symbol);
  if (["BINANCE", "COINBASE", "KRAKEN"].includes(sym.exchange)) {
    const { base } = cryptoPair(sym.ticker);
    const data = await cached('news:crypto:v2', 60000, () => loadCryptoFeeds());
    return selectCryptoNews(data, base);
  }

  if (sym.exchange === "US") {
    const items = await cached(`news:${sym.ticker}`, 10 * 60e3, async () => {
      for (const cls of ["stocks", "etf", "index"]) {
        const j = await getJson(
          `https://api.nasdaq.com/api/news/topic/articlebysymbol?q=${encodeURIComponent(`${sym.ticker.toLowerCase()}|${cls}`)}&offset=0&limit=30&fallback=true`,
          NQ,
        ).catch(() => null);
        const rows = j?.data?.rows || [];
        if (rows.length)
          return rows.map((r) => ({
            title: r.title,
            url: r.url?.startsWith("http")
              ? r.url
              : `https://www.nasdaq.com${r.url}`,
            source: r.publisher,
            time: Date.parse(r.created) || null,
            ago: r.ago,
            summary: r.description || "",
          }));
      }
      return [];
    });
    return {
      items,
      scope: 'asset', updatedAt: Date.now(), refreshSeconds: 120,
      sources: [{ name: 'Nasdaq', available: items.length > 0, count: items.length }],
      note: items.length
        ? `Headlines for ${sym.ticker} from Nasdaq`
        : `No headlines found for ${sym.ticker}`,
    };
  }
  return {
    items: [],
    note: "Headlines are available for crypto and US stocks.",
  };
}

// ---------- fundamentals ----------
function table(t) {
  if (!t?.headers || !t?.rows) return null;
  const keys = Object.keys(t.headers).filter((k) => k !== "value1");
  return {
    periods: keys.map((k) => t.headers[k]),
    rows: t.rows.map((r) => ({
      label: r.value1,
      values: keys.map((k) => r[k] ?? ""),
    })),
  };
}

export async function financials(symbol, frequency = "annual") {
  if (OFFLINE) return null;
  const sym = await resolve(symbol);
  if (sym.exchange !== "US")
    throw Object.assign(
      new Error("Financial statements are for US-listed stocks."),
      { status: 422 },
    );
  const f = frequency === "quarterly" ? 2 : 1;
  return cached(`fin:${sym.ticker}:${f}`, 6 * 3600e3, async () => {
    const [fin, sum, ed] = await Promise.all([
      getJson(
        `https://api.nasdaq.com/api/company/${sym.ticker}/financials?frequency=${f}`,
        NQ,
      ).catch(() => null),
      getJson(
        `https://api.nasdaq.com/api/quote/${sym.ticker}/summary?assetclass=stocks`,
        NQ,
      ).catch(() => null),
      getJson(
        `https://api.nasdaq.com/api/analyst/${sym.ticker}/earnings-date`,
        NQ,
      ).catch(() => null),
    ]);
    const d = fin?.data || {};
    const stats = Object.values(sum?.data?.summaryData || {})
      .map((x) => ({ label: x.label, value: x.value }))
      .filter((x) => x.value && x.value !== "N/A");
    const out = {
      symbol: sym.id,
      frequency,
      stats,
      nextEarnings: (ed?.data?.reportText || "").replace(/\s+/g, " ").trim(),
      income: table(d.incomeStatementTable),
      balance: table(d.balanceSheetTable),
      cashflow: table(d.cashFlowTable),
      ratios: table(d.financialRatiosTable),
      note: "Statement figures are in thousands of US dollars, as Nasdaq reports them.",
    };
    if (!out.income && !stats.length)
      throw Object.assign(
        new Error(
          `Nasdaq has no financials for ${sym.ticker} (ETFs and funds don't file them).`,
        ),
        { status: 404 },
      );
    return out;
  });
}
