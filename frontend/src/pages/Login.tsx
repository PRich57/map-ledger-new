// src/pages/Login.tsx
import { useMsal } from '@azure/msal-react';
import { LogIn } from 'lucide-react';
import { loginRequest } from '../utils/msal';
import { useAuthStore } from '../store/authStore';
import AuthErrorAlert from '../components/AuthErrorAlert';

const MS_SIGNIN_SVG_LIGHT =
  'https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_signin_light.svg';
const MS_SIGNIN_SVG_DARK =
  'https://raw.githubusercontent.com/MicrosoftDocs/entra-docs/main/docs/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_signin_dark.svg';

export default function Login() {
  const { instance } = useMsal();
  const setError = useAuthStore((s) => s.setError);

  const handleLogin = async () => {
    try {
      setError(null);
      await instance.loginRedirect(loginRequest);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center overflow-auto bg-gradient-custom py-12 transition-colors duration-300 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="rounded-xl border border-white/40 bg-white/90 p-3 backdrop-blur-sm shadow-sm transition-colors duration-300 dark:border-slate-700/60 dark:bg-slate-900/80">
            <LogIn className="h-12 w-12 text-primary-600" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900 transition-colors duration-300 dark:text-slate-100">
          Sign in to MapLedger
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-xl border border-white/40 bg-white/90 px-4 py-6 shadow-sm backdrop-blur-sm transition-colors duration-300 dark:border-slate-700/60 dark:bg-slate-900/85 sm:px-10">
          <AuthErrorAlert />
          <button
            type="button"
            onClick={handleLogin}
            className="flex w-full justify-center border-0 bg-transparent p-0"
          >
            <img
              src={MS_SIGNIN_SVG_LIGHT}
              alt="Sign in with Microsoft"
              className="block h-10 w-auto dark:hidden"
            />
            <img
              src={MS_SIGNIN_SVG_DARK}
              alt="Sign in with Microsoft"
              className="hidden h-10 w-auto dark:block"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
