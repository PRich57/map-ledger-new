import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { MsalProvider } from "@azure/msal-react";
import ThemeProvider from "./components/ThemeProvider";
import { msalInstance, initializeMsal } from "./utils/msal";

const rootEl = document.getElementById("root")!;

if (typeof import.meta !== "undefined" && (import.meta as any).env) {
  (globalThis as any).importMetaEnv = (import.meta as any).env;
}

initializeMsal().then(() => {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </MsalProvider>
    </React.StrictMode>
  );
}).catch((e) => {
  // Surface init problems early
  console.error("MSAL initialization failed:", e);
  ReactDOM.createRoot(rootEl).render(
    <div style={{ color: "red", padding: 24, fontFamily: "system-ui" }}>
      MSAL initialization failed. Check your environment variables and redirect URI.
      <pre>{String(e)}</pre>
    </div>
  );
});
