/**
 * Cumulative-probability helper shared by the injury and Special Move drop
 * odds shown on the gym screen. Both are independent per-round rolls with
 * probability `p`; the odds of at least one success over `n` rounds is the
 * complement of "it never happens":
 *
 *   1 - (1 - p) ** n
 *
 * Kills the duplicated inline formula that used to live separately for
 * injury odds and move-drop odds.
 */
export const cumulative = (p, n) => 1 - (1 - p) ** n;
