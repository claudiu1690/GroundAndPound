import { memo } from "react";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { slugFor } from "./libraryContent";

/**
 * Full article view — category label, title, italic summary, body (paragraphs
 * and inline tables), and a "Key Takeaway" callout at the end if present.
 *
 * Scroll-to-top on open is handled by LibraryTab (it scrolls the parent
 * scroll-container ancestor when transitioning from grid → article).
 */
export const ArticleView = memo(function ArticleView({ article, onBack }) {
    const slug = slugFor(article.category);

    return (
        <div className="library-article">
            <nav className="article-nav">
                <button type="button" className="back-btn" onClick={onBack}>
                    <ArrowLeft size={14} /> Back to Library
                </button>
                <span className={`article-nav-cat cat-${slug}`}>{article.category}</span>
            </nav>

            <div className="article-wrap">
                <div className="article-inner">
                    <span className={`article-cat-pill cat-${slug}`}>{article.category}</span>
                    <h1 className="article-title">{article.title}</h1>
                    <p className="article-subtitle">{article.summary}</p>
                    <div className="article-divider" />

                    <div className="article-body">
                        {article.body.map((block, i) => {
                            if (typeof block === "string") {
                                return <p key={i} className="article-p">{block}</p>;
                            }
                            if (block && block.type === "table") {
                                return (
                                    <div key={i} className="article-table-wrap">
                                        <table className="article-table">
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
                        <div className="key-takeaway">
                            <div className="key-takeaway-label"><Lightbulb size={12} /> Key Takeaway</div>
                            <div className="key-takeaway-text">{article.keyTakeaway}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ArticleView;
