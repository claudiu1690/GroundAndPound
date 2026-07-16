/**
 * "The Role Model −10%" attribution chip rendered next to a persona-adjusted
 * price or payout. `tag` is the API's {pct,label} (null → renders nothing).
 * `goodWhenNegative` flips polarity coloring: true for COSTS (a discount is
 * the buff), false for PAYOUTS (a raise is the buff).
 */
export function PersonaPriceTag({ tag, goodWhenNegative = true }) {
  if (!tag || !tag.pct) return null;
  const good = goodWhenNegative ? tag.pct < 0 : tag.pct > 0;
  return (
    <span className={`persona-price-tag ${good ? "good" : "bad"}`}>
      {tag.label} {tag.pct > 0 ? "+" : "−"}{Math.abs(tag.pct)}%
    </span>
  );
}
