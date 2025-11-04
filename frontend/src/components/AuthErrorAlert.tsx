import { useAuthStore } from '../store/authStore';

export default function AuthErrorAlert() {
  const error = useAuthStore((s) => s.error);
  if (!error) return null;
  return (
    <div role="alert" className="mb-4 text-center text-sm text-red-600">
      {error}
    </div>
  );
}
