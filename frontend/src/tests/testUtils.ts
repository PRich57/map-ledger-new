import { ReactElement, act as reactAct } from 'react';
import { createRoot, Root } from 'react-dom/client';

export type TextMatcher = string | RegExp;

type RoleOptions = {
  name?: TextMatcher;
};

type WaitForOptions = {
  timeout?: number;
  interval?: number;
};

const rootDocument: Document | null = typeof document === 'undefined' ? null : document;

const mountedRoots: Array<{ root: Root; container: HTMLElement }> = [];

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const matchesText = (text: string | null | undefined, matcher: TextMatcher): boolean => {
  if (text == null) {
    return false;
  }
  const normalized = normalize(text);
  if (typeof matcher === 'string') {
    return normalized === normalize(matcher);
  }
  return matcher.test(normalized);
};

const getAccessibleName = (element: Element): string => {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return normalize(ariaLabel);
  }

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labels = ariaLabelledBy
      .split(/\s+/)
      .map(id => rootDocument?.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (labels.length > 0) {
      return normalize(labels.map(label => label.textContent ?? '').join(' '));
    }
  }

  if (element instanceof HTMLElement && element.id) {
    const label = rootDocument?.querySelector(`label[for="${element.id}"]`);
    if (label) {
      return normalize(label.textContent ?? '');
    }
  }

  return normalize(element.textContent ?? '');
};

const roleFromElement = (element: Element): string | null => {
  const explicit = element.getAttribute('role');
  if (explicit) {
    return explicit.toLowerCase();
  }

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'button') {
    return 'button';
  }
  if (tagName === 'th') {
    return 'columnheader';
  }
  if (tagName === 'option') {
    return 'option';
  }
  if (tagName === 'section' || tagName === 'main' || tagName === 'aside' || tagName === 'nav') {
    return 'region';
  }
  if (tagName === 'input') {
    const type = (element as HTMLInputElement).type;
    if (type === 'button' || type === 'submit') {
      return 'button';
    }
  }
  return null;
};

const collectElements = (base: ParentNode): Element[] => {
  if ('querySelectorAll' in base) {
    return Array.from((base as Element | Document | DocumentFragment).querySelectorAll('*'));
  }
  return [];
};

const queryAllByText = (base: ParentNode, matcher: TextMatcher): Element[] =>
  collectElements(base).filter(element => matchesText(element.textContent, matcher));

const extractLabelText = (label: HTMLLabelElement): string =>
  Array.from(label.childNodes)
    .map(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? '';
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).textContent ?? '';
      }
      return '';
    })
    .join(' ');

const matchesLabel = (text: string, matcher: TextMatcher): boolean => {
  const normalized = normalize(text);
  if (typeof matcher === 'string') {
    return normalized.includes(normalize(matcher));
  }
  return matcher.test(normalized);
};

const queryAllByLabelText = (base: ParentNode, matcher: TextMatcher): HTMLElement[] => {
  const matches: HTMLElement[] = [];
  const labels =
    'querySelectorAll' in base
      ? Array.from((base as Element | Document | DocumentFragment).querySelectorAll('label'))
      : [];
  labels.forEach(label => {
    if (!(label instanceof HTMLLabelElement)) {
      return;
    }
    const labelText = extractLabelText(label);
    if (!matchesLabel(labelText, matcher)) {
      return;
    }
    if (label.htmlFor) {
      const control = rootDocument?.getElementById(label.htmlFor);
      if (control instanceof HTMLElement) {
        matches.push(control);
      }
      return;
    }
    const nested = label.querySelector('input,textarea,select,button');
    if (nested instanceof HTMLElement) {
      matches.push(nested);
    }
  });

  collectElements(base).forEach(element => {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && matchesText(ariaLabel, matcher)) {
      matches.push(element as HTMLElement);
    }
  });

  return matches;
};

const filterByName = (elements: Element[], matcher?: TextMatcher): Element[] => {
  if (!matcher) {
    return elements;
  }
  return elements.filter(element => matchesText(getAccessibleName(element), matcher));
};

const queryAllByRole = (base: ParentNode, role: string, options?: RoleOptions): Element[] => {
  const lowerRole = role.toLowerCase();
  const elements = collectElements(base).filter(element => roleFromElement(element) === lowerRole);
  return filterByName(elements, options?.name);
};

const makeMissingError = (message: string): Error => new Error(message);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitFor = async <T>(callback: () => T, options: WaitForOptions = {}): Promise<T> => {
  const { timeout = 1000, interval = 20 } = options;
  const start = Date.now();
  let lastError: unknown;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return callback();
    } catch (error) {
      lastError = error;
    }
    if (Date.now() - start >= timeout) {
      throw lastError instanceof Error
        ? lastError
        : new Error('waitFor timed out before condition was met.');
    }
    // eslint-disable-next-line no-await-in-loop
    await wait(interval);
  }
};

type Queries = {
  getByText: (matcher: TextMatcher) => Element;
  getAllByText: (matcher: TextMatcher) => Element[];
  queryByText: (matcher: TextMatcher) => Element | null;
  getByLabelText: (matcher: TextMatcher) => HTMLElement;
  getAllByLabelText: (matcher: TextMatcher) => HTMLElement[];
  queryByLabelText: (matcher: TextMatcher) => HTMLElement | null;
  findByText: (matcher: TextMatcher, options?: WaitForOptions) => Promise<Element>;
  findByLabelText: (matcher: TextMatcher, options?: WaitForOptions) => Promise<HTMLElement>;
  findAllByLabelText: (matcher: TextMatcher, options?: WaitForOptions) => Promise<HTMLElement[]>;
  getByRole: (role: string, options?: RoleOptions) => Element;
  getAllByRole: (role: string, options?: RoleOptions) => Element[];
  getByTestId: (testId: string) => HTMLElement;
  getByTitle: (title: string) => HTMLElement;
};

const createQueries = (base: ParentNode): Queries => {
  const getByText = (matcher: TextMatcher): Element => {
    const results = queryAllByText(base, matcher);
    if (results.length === 0) {
      throw makeMissingError(`Unable to find element with text: ${matcher.toString()}`);
    }
    return results[0];
  };

  const getAllByText = (matcher: TextMatcher): Element[] => {
    const results = queryAllByText(base, matcher);
    if (results.length === 0) {
      throw makeMissingError(`Unable to find elements with text: ${matcher.toString()}`);
    }
    return results;
  };

  const queryByText = (matcher: TextMatcher): Element | null => queryAllByText(base, matcher)[0] ?? null;

  const getByLabelText = (matcher: TextMatcher): HTMLElement => {
    const results = queryAllByLabelText(base, matcher);
    if (results.length === 0) {
      throw makeMissingError(`Unable to find element with label: ${matcher.toString()}`);
    }
    return results[0];
  };

  const getAllByLabelText = (matcher: TextMatcher): HTMLElement[] => {
    const results = queryAllByLabelText(base, matcher);
    if (results.length === 0) {
      throw makeMissingError(`Unable to find elements with label: ${matcher.toString()}`);
    }
    return results;
  };

  const queryByLabelText = (matcher: TextMatcher): HTMLElement | null =>
    queryAllByLabelText(base, matcher)[0] ?? null;

  const getByRole = (role: string, options?: RoleOptions): Element => {
    const results = queryAllByRole(base, role, options);
    if (results.length === 0) {
      throw makeMissingError(`Unable to find element by role: ${role}`);
    }
    return results[0];
  };

  const getAllByRole = (role: string, options?: RoleOptions): Element[] => {
    const results = queryAllByRole(base, role, options);
    if (results.length === 0) {
      throw makeMissingError(`Unable to find elements by role: ${role}`);
    }
    return results;
  };

  const getByTestId = (testId: string): HTMLElement => {
    if ('querySelector' in base) {
      const result = (base as Element | Document | DocumentFragment).querySelector(
        `[data-testid="${testId}"]`,
      );
      if (result instanceof HTMLElement) {
        return result;
      }
    }
    throw makeMissingError(`Unable to find element by test id: ${testId}`);
  };

  const getByTitle = (title: string): HTMLElement => {
    if ('querySelectorAll' in base) {
      const candidates = Array.from(
        (base as Element | Document | DocumentFragment).querySelectorAll('[title]'),
      );
      const match = candidates.find(candidate => candidate.getAttribute('title') === title);
      if (match instanceof HTMLElement) {
        return match;
      }
    }
    throw makeMissingError(`Unable to find element with title: ${title}`);
  };

  return {
    getByText,
    getAllByText,
    queryByText,
    getByLabelText,
    getAllByLabelText,
    queryByLabelText,
    findByText: (matcher, options) => waitFor(() => getByText(matcher), options),
    findByLabelText: (matcher, options) => waitFor(() => getByLabelText(matcher), options),
    findAllByLabelText: (matcher, options) =>
      waitFor(() => {
        const results = getAllByLabelText(matcher);
        if (results.length === 0) {
          throw makeMissingError(`Unable to find elements with label: ${matcher.toString()}`);
        }
        return results;
      }, options),
    getByRole,
    getAllByRole,
    getByTestId,
    getByTitle,
  };
};

const createDomUnavailableQueries = (): Queries => {
  const createError = () => new Error('DOM is not available in the current test environment.');
  const handler = () => {
    throw createError();
  };
  const asyncHandler = () => Promise.reject(createError());
  return {
    getByText: handler,
    getAllByText: handler,
    queryByText: () => null,
    getByLabelText: handler,
    getAllByLabelText: handler,
    queryByLabelText: () => null,
    findByText: asyncHandler,
    findByLabelText: asyncHandler,
    findAllByLabelText: asyncHandler,
    getByRole: handler,
    getAllByRole: handler,
    getByTestId: handler as unknown as (testId: string) => HTMLElement,
    getByTitle: handler as unknown as (title: string) => HTMLElement,
  };
};

export const screen = rootDocument ? createQueries(rootDocument) : createDomUnavailableQueries();

export const within = (element: ParentNode): Queries => createQueries(element);

export const fireEvent = {
  click: (element: Element) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    reactAct(() => {
      element.dispatchEvent(event);
    });
  },
  change: (element: Element, init: { target: { value: string } }) => {
    if ('value' in element && typeof init.target?.value === 'string') {
      (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = init.target.value;
    }
    const event = new Event('change', { bubbles: true, cancelable: true });
    Object.assign(event, init);
    reactAct(() => {
      element.dispatchEvent(event);
    });
  },
  blur: (element: Element, init?: EventInit) => {
    const event = new FocusEvent('blur', { bubbles: true, cancelable: true, ...init });
    reactAct(() => {
      element.dispatchEvent(event);
    });
  },
  input: (element: Element, init: { target: { value: string } }) => {
    if ('value' in element && typeof init.target?.value === 'string') {
      (element as HTMLInputElement | HTMLTextAreaElement).value = init.target.value;
    }
    const event = new Event('input', { bubbles: true, cancelable: true });
    Object.assign(event, init);
    reactAct(() => {
      element.dispatchEvent(event);
    });
  },
};

export const act = reactAct;

export const render = (ui: ReactElement) => {
  if (!rootDocument) {
    throw new Error('render requires a DOM environment.');
  }
  const container = rootDocument.createElement('div');
  rootDocument.body.appendChild(container);
  const root = createRoot(container);
  reactAct(() => {
    root.render(ui);
  });
  mountedRoots.push({ root, container });
  return {
    container,
    rerender: (nextUi: ReactElement) => {
      reactAct(() => {
        root.render(nextUi);
      });
    },
    unmount: () => {
      reactAct(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
};

export const cleanup = () => {
  if (!rootDocument) {
    mountedRoots.length = 0;
    return;
  }
  while (mountedRoots.length) {
    const entry = mountedRoots.pop();
    if (!entry) {
      continue;
    }
    reactAct(() => {
      entry.root.unmount();
    });
    if (entry.container.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }
  }
  rootDocument.body.innerHTML = '';
};

export { waitFor };