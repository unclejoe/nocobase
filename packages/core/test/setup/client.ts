import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import dotenv from 'dotenv';
import { vi } from 'vitest';

/**
 * 解决 TypeError: URL.createObjectURL is not a function
 * 解决 ReferenceError: Worker is not defined
 */
import 'jsdom-worker';
import path from 'path';

configure({ asyncUtilTimeout: 30000 });
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

// Some vitest + jsdom combinations expose `window.localStorage` /
// `window.sessionStorage` as empty objects whose `getItem` is undefined, which
// breaks the SDK Storage layer (and therefore any component that issues API
// requests through the authenticated client). Provide a minimal in-memory
// polyfill; this is a no-op when jsdom already provides a working Storage.
if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const createPolyfill = () => {
    const store: Record<string, string> = {};
    return {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    };
  };
  Object.defineProperty(window, 'localStorage', { value: createPolyfill(), configurable: true, writable: true });
  Object.defineProperty(window, 'sessionStorage', { value: createPolyfill(), configurable: true, writable: true });
}

// 解决 TypeError: window.matchMedia is not a function
// 参见： https://github.com/vitest-dev/vitest/issues/821#issuecomment-1046954558
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// 解决 Error: Not implemented: window.computedStyle(elt, pseudoElt)
// 参见：https://github.com/nickcolley/jest-axe/issues/147#issuecomment-758804533
const { getComputedStyle } = window;
window.getComputedStyle = (elt) => getComputedStyle(elt);

/**
 * 解决 TypeError: range.getBoundingClientRect is not a function
 * 参见：https://github.com/jsdom/jsdom/issues/3002
 */
document.createRange = () => {
  const range = new Range();

  range.getBoundingClientRect = () => {
    return {
      x: 0,
      y: 0,
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      toJSON: () => {},
    };
  };

  range.getClientRects = () => {
    return {
      item: (index) => null,
      length: 0,
      *[Symbol.iterator]() {},
    };
  };

  return range;
};
