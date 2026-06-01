import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { LIBRARY_ARTICLES, LIBRARY_CATEGORIES, articleSearchText, slugFor } from "./libraryContent";
import { ArticleCard } from "./ArticleCard";
import { ArticleView } from "./ArticleView";

/**
 * Library — in-game knowledge base.
 *
 * Two views in one tab:
 *   - Grid view: search bar + category pills + responsive card grid
 *   - Article view: full article with back button (returns to grid at the
 *     same scroll position the player left it at)
 *
 * Search runs in-memory across title, summary, body, tags, and keyTakeaway.
 * No pagination — content set is small enough to render all at once.
 */
export function LibraryTab() {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("All");
    const [articleId, setArticleId] = useState(null);
    const rootRef = useRef(null);
    const savedScrollY = useRef(0);

    // ── Precompute search index once on mount ─────────────────────
    const searchIndex = useMemo(() => {
        return LIBRARY_ARTICLES.map((a) => ({
            id: a.id,
            text: articleSearchText(a),
        }));
    }, []);

    // ── Apply filters ─────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        let pool = LIBRARY_ARTICLES;
        if (category !== "All") {
            pool = pool.filter((a) => a.category === category);
        }
        if (q) {
            const matchIds = new Set(
                searchIndex.filter((s) => s.text.includes(q)).map((s) => s.id)
            );
            pool = pool.filter((a) => matchIds.has(a.id));
        }
        return pool;
    }, [query, category, searchIndex]);

    const currentArticle = articleId
        ? LIBRARY_ARTICLES.find((a) => a.id === articleId)
        : null;

    // ── Article open / close — preserve grid scroll position ──────
    // The actual scroll container is whichever ancestor has overflow-y set
    // (.app-main in the current layout). Walk up from our root to find it.
    const findScrollAncestor = useCallback(() => {
        let el = rootRef.current?.parentElement;
        while (el) {
            const oy = getComputedStyle(el).overflowY;
            if (oy === "auto" || oy === "scroll") return el;
            el = el.parentElement;
        }
        return null;
    }, []);
    const openArticle = useCallback((id) => {
        const scroller = findScrollAncestor();
        savedScrollY.current = scroller?.scrollTop ?? 0;
        setArticleId(id);
        // Scroll the ancestor back to the top so a newly-opened article starts
        // at its headline, not wherever the grid view was scrolled.
        if (scroller) scroller.scrollTop = 0;
    }, [findScrollAncestor]);
    const closeArticle = useCallback(() => {
        setArticleId(null);
    }, []);
    useEffect(() => {
        if (!articleId) {
            const scroller = findScrollAncestor();
            if (scroller) scroller.scrollTop = savedScrollY.current;
        }
    }, [articleId, findScrollAncestor]);

    // ── Article view ──────────────────────────────────────────────
    if (currentArticle) {
        return (
            <ArticleView article={currentArticle} onBack={closeArticle} />
        );
    }

    // ── Grid view ─────────────────────────────────────────────────
    const tabs = ["All", ...LIBRARY_CATEGORIES];

    return (
        <div className="library-tab" ref={rootRef}>
            <header className="lib-header">
                <div className="lib-eyebrow">Knowledge Base</div>
                <div className="lib-title-row">
                    <h2 className="lib-title">Library</h2>
                    <span className="lib-count">{LIBRARY_ARTICLES.length} articles</span>
                </div>
                <p className="lib-sub">Every system in the game, explained.</p>
            </header>

            <div className="lib-controls">
                <div className="search-wrap">
                    <Search className="search-icon" size={15} aria-hidden="true" />
                    <input
                        type="search"
                        className="search-input"
                        placeholder="Search articles…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoComplete="off"
                    />
                    {query && (
                        <button
                            type="button"
                            className="search-clear"
                            onClick={() => setQuery("")}
                            aria-label="Clear search"
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    )}
                </div>

                <div className="filters" role="tablist" aria-label="Library categories">
                    {tabs.map((c) => {
                        const isAll = c === "All";
                        const slug = isAll ? "all" : slugFor(c);
                        const active = c === category;
                        return (
                            <button
                                key={c}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                className={`filter-btn cat-${slug}${active ? " is-active" : ""}${isAll && active ? " active-all" : ""}`}
                                onClick={() => setCategory(c)}
                            >
                                {c}
                            </button>
                        );
                    })}
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="library-empty">
                    {query
                        ? <>Nothing found for &quot;{query}&quot;. Try a different word or browse by category.</>
                        : "No articles in this category."}
                </div>
            ) : (
                <div className="article-grid">
                    {filtered.map((a) => (
                        <ArticleCard
                            key={a.id}
                            article={a}
                            query={query}
                            onOpen={() => openArticle(a.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default memo(LibraryTab);
