import { Component } from "react";

/**
 * Catches a render error inside the fight reveal. The fight is already resolved on the server,
 * so the safe fallback is to skip straight to the result: `onError` is called once and the
 * boundary renders nothing. Without it, a malformed event would blank the whole app at the
 * moment of the first fight, with the fighter-refresh gate left closed.
 */
export class RevealErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
    this.reported = false;
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("[FightReveal] render failed, skipping to the result", error);
    if (!this.reported) {
      this.reported = true;
      this.props.onError?.();
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
