import { useAuthStore } from '../store/authStore';

export default function Dashboard() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Welcome back, {user?.firstName}!</h1>
      </header>
      <section
        aria-label="Dashboard content"
        className="rounded-lg bg-white p-6 shadow"
      >
        <p className="text-gray-700">Your dashboard content will appear here.</p>
      </section>
    </div>
  );
}
