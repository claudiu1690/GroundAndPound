import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * Condensed sticky bar (gym name + energy pill) shown once the header
 * scrolls out of view. Mobile-focused but harmless at any width — energy is
 * spent on every tap of this screen, so it should never be off-screen.
 */
export function StickyGymBar({ headerRef, gymName, energy }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = headerRef?.current;
        if (!el || typeof IntersectionObserver === "undefined") return undefined;
        const observer = new IntersectionObserver(
            ([entry]) => setVisible(!entry.isIntersecting),
            { threshold: 0 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [headerRef]);

    if (!visible) return null;

    return (
        <div className="sticky-gym-bar">
            <b>{gymName}</b>
            <span className="sticky-gym-bar-pill" aria-label={t("gym.sticky.energyLabel")}><Zap size={12} /> {energy}</span>
        </div>
    );
}
