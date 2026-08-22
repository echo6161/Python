import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

class ResizeObserverStub implements ResizeObserver {
  private readonly observedElements = new Set<Element>();

  public disconnect(): void {
    this.observedElements.clear();
  }

  public observe(target: Element): void {
    this.observedElements.add(target);
  }

  public unobserve(target: Element): void {
    this.observedElements.delete(target);
  }
}

globalThis.ResizeObserver = ResizeObserverStub;

afterEach(() => {
  cleanup();
});
