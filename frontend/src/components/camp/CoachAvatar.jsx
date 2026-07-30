import { memo, useState } from "react";

/**
 * A coach's face — portrait when one is assigned, initials when not.
 *
 * ONE home for the fallback, because there are three render sites (StaffRow tile 52px,
 * CoachPanel header 78px, CandidateCard hire card 48px) and three copies of "try the image,
 * fall back to initials" is three chances for one of them to render a broken-image icon.
 *
 * TWO fallback paths, both needed:
 *   · `portraitUrl` is null — the coach predates the portrait pool, or the pool is empty.
 *     The server decides this; the client never guesses a filename.
 *   · the asset 404s — the pool shrank, or a file is missing. `onError` catches it and we
 *     drop to initials rather than leaving a torn image in the roster.
 *
 * The rarity ring (`--rc`) sits on the wrapper either way, so a coach with a portrait and a
 * coach without still read as the same component in the same row.
 *
 * SIZING IS NOT SET HERE — it lives in App.css, keyed off `--av-w` per context
 * (`.yc-tile-top`, `.yc-cm-header`, `.yc-cand-avatar`). This component used to take a `size`
 * prop and write `width`/`height` inline, which quietly outranked every class selector: the
 * `max-width: 980px` rule that shrinks the panel avatar on mobile had no effect at all for as
 * long as the inline style existed. Sizing belongs wherever the media queries are.
 */
export const CoachAvatar = memo(function CoachAvatar({ coach, className = "", style = {} }) {
    const [failed, setFailed] = useState(false);
    const url = coach?.portraitUrl;
    const showImage = !!url && !failed;

    return (
        <div
            className={`yc-avatar${showImage ? " has-portrait" : ""}${className ? ` ${className}` : ""}`}
            style={style}
        >
            {showImage
                // NOT `loading="lazy"`. There are at most 4 roster + 6 market avatars, all of them
                // above the fold the moment the camp screen opens, and each is a ~85 KB asset the
                // fighter art already ships. Deferring them buys nothing and costs a visible pop-in
                // of initials-then-face — and the lazy heuristic demonstrably declines to fire for
                // some in-viewport tiles, leaving a coach permanently faceless.
                ? <img src={url} alt="" onError={() => setFailed(true)} />
                : (coach?.initials || "??")}
        </div>
    );
});
