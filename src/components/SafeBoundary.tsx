/**
 * SafeBoundary — contains a render/effect crash to its subtree instead of
 * blanking the whole app. Used to wrap global overlays (e.g. the invite
 * prompt) that are mounted alongside the navigator: if they throw, they
 * should quietly disappear, not white-screen navigation.
 */
import { Component, type ReactNode } from 'react';

export class SafeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('[SafeBoundary] contained a crash:', err); }
  render() { return this.state.failed ? null : this.props.children; }
}
