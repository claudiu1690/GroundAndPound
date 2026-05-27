import { memo } from "react";

/**
 * Full article view — category label, title, italic summary, body (paragraphs
 * and inline tables), and a "Key Takeaway" callout at the end if present.
 *
 * Scroll-to-top on open is handled by LibraryTab (it scrolls the parent
 * scroll-container ancestor when transitioning from grid → article).
 */
export const ArticleView = memo(function ArticleView({ article, onBack }) {
    return (
        <div className="library-article">
            <button
                type="button"
                className="library-back-btn"
                onClick={onBack}
            >
                ← Back to Library
            </button>

            <article className="library-article-body">
                <div className="library-article-category">{article.category}</div>
                <h1 className="library-article-title">{article.title}</h1>
                <p className="library-article-summary">{article.summary}</p>

                <div className="library-article-content">
                    {article.body.map((block, i) => {
                        if (typeof block === "string") {
                            return <p key={i} className="library-article-paragraph">{block}</p>;
                        }
                        if (block && block.type === "table") {
                            return (
                                <div key={i} className="library-article-table-wrap">
                                    <table className="library-article-table">
                                        <thead>
                                            <tr>
                                                {block.headers.map((h, j) => (
                                                    <th key={j}>{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {block.rows.map((row, ri) => (
                                                <tr key={ri}>
                                                    {row.map((cell, ci) => (
                                                        <td key={ci}>{cell}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>

                {article.keyTakeaway && (
                    <div className="library-key-takeaway">
                        <div className="library-key-takeaway-label">Key Takeaway</div>
                        <div className="library-key-takeaway-body">
                            {article.keyTakeaway}
                        </div>
                    </div>
                )}
            </article>
        </div>
    );
});

export default ArticleView;
