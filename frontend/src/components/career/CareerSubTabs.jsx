import { List, User } from "lucide-react";

const TABS = [
  { id: "feed",    label: "Feed",    Icon: List },
  { id: "profile", label: "Profile", Icon: User },
];

/** Feed / Profile pill bar for the Career page. */
export function CareerSubTabs({ active, onChange }) {
  return (
    <div className="sub-tabs">
      {TABS.map(({ id, label, Icon }) => (
        <button
          type="button"
          key={id}
          className={`st${active === id ? " act" : ""}`}
          onClick={() => onChange(id)}
        >
          <Icon size={13} /> {label}
        </button>
      ))}
    </div>
  );
}
