import { List, User } from "lucide-react";
import { t } from "@/lib/i18n";

const TABS = [
  { id: "feed",    labelKey: "career.subTabs.feed",    Icon: List },
  { id: "profile", labelKey: "career.subTabs.profile", Icon: User },
];

/** Feed / Profile pill bar for the Career page. */
export function CareerSubTabs({ active, onChange }) {
  return (
    <div className="sub-tabs">
      {TABS.map(({ id, labelKey, Icon }) => (
        <button
          type="button"
          key={id}
          className={`st${active === id ? " act" : ""}`}
          onClick={() => onChange(id)}
        >
          <Icon size={13} /> {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
