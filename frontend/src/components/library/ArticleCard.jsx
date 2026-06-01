import { memo } from "react";
import { slugFor } from "./libraryContent";

/**
 * Article tile in the Library grid. Shows category label, title, summary.
 * When a search query is active and matches part of the title or summary,
 * the matching span is highlighted.
 */
function highlight(text, query) {
    if (!query) return text;
    const q = query.trim();
    if (!q) return text;
    // Case-insensitive split preserving the matched casing.
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    const parts = text.split(re);
    return parts.map((part, i) =>
        re.test(part)
            ? <mark key={i} className="library-highlight">{part}</mark>
            : part
    );
}

export const ArticleCard = memo(function ArticleCard({ article, query, onOpen }) {
    const slug = slugFor(article.category);
    return (
        <button type="button" className="article-card" onClick={onOpen}>
            <div className={`article-top-stripe ${slug}`} />
            <div className="article-body">
                <div className={`article-cat ${slug}`}>{article.category}</div>
                <div className="article-title">{highlight(article.title, query)}</div>
                <div className="article-desc">{highlight(article.summary, query)}</div>
            </div>
        </button>
    );
});

export default ArticleCard;
