const getRequired = (value: string | undefined, name: string): string => {
  if (!value) {
    const message = `Missing environment variable ${name}. Please set ${name} in your .env file.`;
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      window.alert(message);
    }
    console.error(message);
    throw new Error(message);
  }
  return value;
};

export const env = {
  AAD_CLIENT_ID: getRequired(import.meta.env.VITE_AAD_CLIENT_ID, 'VITE_AAD_CLIENT_ID'),
  AAD_TENANT_ID: getRequired(import.meta.env.VITE_AAD_TENANT_ID, 'VITE_AAD_TENANT_ID'),
  AAD_REDIRECT_URI: getRequired(
    import.meta.env.VITE_AAD_REDIRECT_URI,
    'VITE_AAD_REDIRECT_URI',
  ),
  AAD_ADMIN_GROUP_ID: import.meta.env.VITE_AAD_ADMIN_GROUP_ID || '',
  AAD_EMPLOYEE_DOMAINS: (import.meta.env.VITE_AAD_EMPLOYEE_DOMAINS || '')
    .split(',')
    .map((d: string) => d.trim())
    .filter(Boolean),
};
