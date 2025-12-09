import { expect } from '@jest/globals';
import { cleanup, TextMatcher } from './testUtils';

if (typeof globalThis !== 'undefined') {
  if (!(globalThis as { localStorage?: Storage }).localStorage) {
    const storage = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
      removeItem: key => {
        storage.delete(key);
      },
      clear: () => storage.clear(),
      key: index => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    } as Storage;
  }
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { importMetaEnv?: Partial<ImportMetaEnv> }).importMetaEnv = {
    VITE_API_BASE_URL: '/api',
    DEV: false,
    VITE_ENABLE_DEBUG_LOGGING: 'false',
  };
  if (!(globalThis as { fetch?: typeof fetch }).fetch) {
    (globalThis as { fetch: typeof fetch }).fetch = jest.fn();
  }
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

const toHaveClass = (received: HTMLElement | null, expected: string): MatcherResult => {
  if (!received) {
    return {
      pass: false,
      message: () => 'Element is not present in the document.',
    };
  }
  const classes = (received.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
  const expectedClasses = expected.split(/\s+/).filter(Boolean);
  const pass = expectedClasses.every(cls => classes.includes(cls));
  return {
    pass,
    message: () =>
      pass
        ? `Expected element not to include classes: ${expected}`
        : `Expected element to include classes: ${expected}`,
  };
};

const toHaveAttribute = (
  received: HTMLElement | null,
  attribute: string,
  expected?: string,
): MatcherResult => {
  if (!received) {
    return {
      pass: false,
      message: () => 'Element is not present in the document.',
    };
  }
  const actual = received.getAttribute(attribute);
  const pass = expected === undefined ? actual !== null : actual === expected;
  return {
    pass,
    message: () =>
      pass
        ? `Expected element not to have attribute ${attribute}`
        : `Expected element to have attribute ${attribute}${
            expected !== undefined ? `="${expected}"` : ''
          }`,
  };
};

expect.extend({
  toBeInTheDocument,
  toHaveTextContent,
  toHaveClass,
  toHaveAttribute,
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveTextContent(expected: TextMatcher): R;
      toHaveClass(expected: string): R;
      toHaveAttribute(attribute: string, value?: string): R;
    }
  }
}

export { waitFor };