export function FightDescription({ commentary }) {
  if (!commentary?.length) return null;

  return (
    <section className="panel fight-description">
      <h2 className="panel-title">Fight description</h2>
      <div className="commentary-scroll">
        {commentary.map((line, i) => (
          <p key={i} className="commentary-line">{line}</p>
        ))}
      </div>
    </section>
  );
}
