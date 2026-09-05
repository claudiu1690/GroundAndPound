import { t } from "@/lib/i18n";
import { ProvingGroundTile } from "./tiles/ProvingGroundTile";
import { RankingsTile } from "./tiles/RankingsTile";
import { IdentityTile } from "./tiles/IdentityTile";
import { VitalsTile } from "./tiles/VitalsTile";
import { InjuryTile } from "./tiles/InjuryTile";
import { FightCampTile } from "./tiles/FightCampTile";
import { StatsTile } from "./tiles/StatsTile";
import { MyCampTile } from "./tiles/MyCampTile";
import { MoneyFameTile } from "./tiles/MoneyFameTile";
import { SponsorTile } from "./tiles/SponsorTile";
import { GazetteTile } from "./tiles/GazetteTile";
import { CareerFeedTile } from "./tiles/CareerFeedTile";

/**
 * The Fight Night dashboard grid — desktop DOM order is grouped by band (for
 * clean 12-column spans); the mobile priority order (My Camp before Identity,
 * Identity before Stats & XP — home-contract.md §8) is applied purely with
 * CSS `order` inside the phone @container query in home.css, keyed off each
 * tile's className hook (hn-pg, hn-rank, hn-id, ...).
 */
export function HomeGrid({
  fighter,
  data,
  loading,
  statRows,
  onNavigate,
  onOpenCareerProfile,
  onOpenGazette,
  gymsRetired,
}) {
  const ovr = fighter?.overallRating ?? 0;

  return (
    <div className="hn-wrap">
      <div className="hn-grid">
        <div className="hn-eb hn-eb--ringside hn-anim" style={{ "--i": 0 }}>
          <h2>{t("home.band.ringside")}</h2>
        </div>

        <ProvingGroundTile pvp={data?.pvp ?? null} pvpDefense={fighter?.pvpDefense ?? null} loading={loading && !data} onNavigate={onNavigate} index={1} />
        <RankingsTile ranking={data?.ranking ?? null} weightClass={fighter?.weightClass} loading={loading && !data} onNavigate={onNavigate} index={2} />
        <IdentityTile fighter={fighter} onOpenCareerProfile={onOpenCareerProfile} index={3} />

        <div className="hn-eb hn-eb--corner hn-anim" style={{ "--i": 4 }}>
          <h2>{t("home.band.corner")}</h2>
        </div>

        <VitalsTile fighter={fighter} onNavigate={onNavigate} index={5} />
        <InjuryTile injuries={data?.injuries ?? null} loading={loading && !data} onNavigate={onNavigate} index={6} />
        <FightCampTile camp={data?.camp ?? null} loading={loading && !data} onNavigate={onNavigate} index={7} />
        <StatsTile statRows={statRows} ovr={ovr} onNavigate={() => onNavigate?.(gymsRetired ? "camp" : "gym")} index={8} />
        <MyCampTile homeCamp={data?.homeCamp ?? null} loading={loading && !data} onNavigate={onNavigate} index={9} />

        <div className="hn-eb hn-eb--purse hn-anim" style={{ "--i": 10 }}>
          <h2>{t("home.band.purseBand")}</h2>
        </div>

        <MoneyFameTile fighter={fighter} resources={data?.resources ?? null} index={11} />
        <SponsorTile sponsorship={data?.sponsorship ?? null} loading={loading && !data} onNavigate={onNavigate} index={12} />

        <div className="hn-eb hn-eb--press hn-anim" style={{ "--i": 13 }}>
          <h2>{t("home.band.press")}</h2>
        </div>

        <GazetteTile gazette={fighter?.gazette ?? null} onOpen={onOpenGazette} index={14} />
        <CareerFeedTile feed={data?.feed} loading={loading && !data} onNavigate={onNavigate} index={15} />
      </div>
    </div>
  );
}
