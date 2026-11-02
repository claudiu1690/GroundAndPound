import { DiscordIcon } from "../shared/DiscordIcon";
import { InstagramIcon, FacebookIcon, TikTokIcon } from "../shared/SocialIcons";

// One list for every nav icon and footer link on the logged-out site (landing page
// and roadmap page). `key` names the nav-link--{key} hover tint in landing.css.
export const SOCIAL_LINKS = [
  { key: "discord", label: "Discord", aria: "Join our Discord", href: "https://discord.gg/jDmh4wuBMb", Icon: DiscordIcon },
  { key: "instagram", label: "Instagram", aria: "Ground & Pound on Instagram", href: "https://www.instagram.com/groundandpoundgame/", Icon: InstagramIcon },
  { key: "facebook", label: "Facebook", aria: "Ground & Pound on Facebook", href: "https://www.facebook.com/profile.php?id=1163953513473862", Icon: FacebookIcon },
  { key: "tiktok", label: "TikTok", aria: "Ground & Pound on TikTok", href: "https://www.tiktok.com/@groundandpound1", Icon: TikTokIcon },
];
