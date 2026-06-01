import { memo } from "react";

export const FightDescription = memo(function FightDescription({ commentary }) {
  if (!commentary?.length) return null;

  const n = commentary.length;

  return (
    <div className="card" style={{ height: "fit-content" }}>
      <div className="card-label">Fight Description</div>
      <div className="round-list">
        {commentary.map((line, i) => {
          // Result line: last of a multi-line list, or the only line.
          const isResult = i === n - 1 && n > 1 ? true : n === 1;
          // Intro line: first of a multi-line list.
          const isIntro = i === 0 && n > 1;

          if (isResult) {
            return (
              <div key={i} className="round-row">
                <span className="round-label">Result</span>
                <span className="round-text round-text--final">{line}</span>
              </div>
            );
          }

          if (isIntro) {
            return (
              <div key={i} className="round-row">
                <span className="round-label">Intro</span>
                <span className="round-text">{line}</span>
              </div>
            );
          }

          // Middle lines: either "Round N: ..." or camp/wildcard flavor.
          const match = line.match(/^Round (\d+):\s*/);
          if (match) {
            return (
              <div key={i} className="round-row">
                <span className="round-label">Round {match[1]}</span>
                <span className="round-text">{line.slice(match[0].length)}</span>
              </div>
            );
          }

          return (
            <div key={i} className="round-row">
              <span className="round-label" />
              <span className="round-text round-text--indent">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
