import type { User } from '../types';

const allowedDomains = ['@ksmta.com', '@ksmcpa.com'];

export const isKsmDomainUser = (user?: Pick<User, 'email'> | null): boolean => {
  const email = user?.email?.trim().toLowerCase();
  if (!email) {
    return false;
  }

  return allowedDomains.some((domain) => email.endsWith(domain));
};
