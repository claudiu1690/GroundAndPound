import { useEffect, useState } from "react";

/**
 * Red "something new" dot on the Shop nav item.
 *
 * Lit until the player opens the Shop once, then remembered in localStorage.
 * To light it again for everyone when the Shop gets something new, bump SHOP_NEWS_ID.
 * If storage is unreadable the dot stays off: it could never be cleared for good.
 */
const SHOP_NEWS_ID = "premium-drinks-2.2";
const SHOP_NEWS_KEY = "gnp_shop_news_seen";

export function useShopNews(activeTab) {
  const [unseen, setUnseen] = useState(() => {
    try {
      return localStorage.getItem(SHOP_NEWS_KEY) !== SHOP_NEWS_ID;
    } catch (_) {
      return false;
    }
  });

  // Any route into the Shop counts as seeing it (nav click, dashboard link, Stripe return).
  useEffect(() => {
    if (!unseen || activeTab !== "shop") return;
    setUnseen(false);
    try { localStorage.setItem(SHOP_NEWS_KEY, SHOP_NEWS_ID); } catch (_) {}
  }, [unseen, activeTab]);

  return unseen;
}
