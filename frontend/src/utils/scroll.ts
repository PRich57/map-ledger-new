export interface ScrollToTopOptions {
  behavior?: ScrollBehavior;
}

export const scrollPageToTop = (options?: ScrollToTopOptions) => {
  if (typeof window === 'undefined') {
    return;
  }

  const { behavior = 'smooth' } = options ?? {};

  if (typeof document !== 'undefined') {
    const scrollContainer = document.getElementById('app-scroll-container');

    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, left: 0, behavior });
      return;
    }
  }

  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top: 0, left: 0, behavior });
  }
};

export default scrollPageToTop;
