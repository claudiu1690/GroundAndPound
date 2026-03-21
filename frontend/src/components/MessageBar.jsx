import { memo } from "react";

export const MessageBar = memo(function MessageBar({ message }) {
  if (!message) return null;
  return (
    <div className="message-bar">
      {message}
    </div>
  );
});
