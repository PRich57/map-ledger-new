interface StatusBadgeProps {
  status: 'coming_soon' | 'beta';
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    coming_soon: 'bg-yellow-100 text-yellow-800',
    beta: 'bg-purple-100 text-purple-800',
  };

  const labels = {
    coming_soon: 'Coming Soon',
    beta: 'Beta',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}