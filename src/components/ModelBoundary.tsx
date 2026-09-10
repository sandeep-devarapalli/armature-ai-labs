import { Component, type ReactNode } from "react";

export class ModelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="alert">3D is unavailable. Use the preview or native downloads below; the room information is still available.</p>
      : this.props.children;
  }
}
