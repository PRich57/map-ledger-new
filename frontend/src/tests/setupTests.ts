import { expect } from '@jest/globals';
import { cleanup, TextMatcher } from './testUtils';

if (typeof globalThis !== 'undefined') {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

afterEach(() => {
  cleanup();
});

type MatcherResult = {
  pass: boolean;
  message: () => string;
};

const toBeInTheDocument = (received: HTMLElement | null): MatcherResult => {
  const pass = Boolean(received && document.body.contains(received));
  return {
    pass,
    message: () =>
      pass
        ? 'Expected element not to be present in the document.'
        : 'Expected element to be present in the document.',
  };
};

const toHaveTextContent = (received: HTMLElement | null, expected: TextMatcher): MatcherResult => {
  if (!received) {
    return {
      pass: false,
      message: () => 'Element is not present in the document.',
    };
  }
  const text = received.textContent ?? '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  const pass = typeof expected === 'string' ? normalized === expected : expected.test(normalized);
  return {
    pass,
    message: () =>
      pass
        ? `Expected text not to match ${expected.toString()}, but it did.`
        : `Expected text to match ${expected.toString()}, but received "${normalized}".`,
  };
};

expect.extend({
  toBeInTheDocument,
  toHaveTextContent,
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveTextContent(expected: TextMatcher): R;
    }
  }
}