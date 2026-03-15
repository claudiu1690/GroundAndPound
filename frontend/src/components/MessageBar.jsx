export function MessageBar({ message }) {
  if (!message) return null;
  return (
    <div className="message-bar">
      {message}
    </div>
  );
}
