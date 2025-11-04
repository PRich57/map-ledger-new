import { PublicClientApplication, BrowserCacheLocation, LogLevel, RedirectRequest, AccountInfo } from "@azure/msal-browser";
import { env } from "../utils/env"; // you already have utils/env.ts

const msalConfig = {
  auth: {
    clientId: env.AAD_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${env.AAD_TENANT_ID}`,
    redirectUri: env.AAD_REDIRECT_URI,
    postLogoutRedirectUri: env.AAD_REDIRECT_URI
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: false
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (_level: LogLevel, message: string) => {
        console.log("[MSAL]", message);
      }
    }
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);

let initPromise: Promise<void> | null = null;

export function initializeMsal(): Promise<void> {
  if (!initPromise) {
    initPromise = msalInstance.initialize().then(() => {
      // preserve the session if user is already signed in
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        msalInstance.setActiveAccount(accounts[0]);
      }
    });
  }
  return initPromise;
}

export const loginRequest: RedirectRequest = {
  scopes: ['openid', 'profile', 'email'],
};

function getCurrentAccount(): AccountInfo | null {
  const active = msalInstance.getActiveAccount();
  if (active) return active;
  const all = msalInstance.getAllAccounts();
  return all.length ? all[0] : null;
}

export async function signOut(): Promise<void> {
  // Ensure MSAL is initialized
  await initializeMsal();

  const account = getCurrentAccount();
  // logoutRedirect accepts undefined account, but we prefer to be explicit when we have one
  await msalInstance.logoutRedirect(
    account ? { account } : undefined
  );
}
