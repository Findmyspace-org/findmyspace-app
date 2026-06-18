type SectionInlineAlertProps = {
  status?: string | null;
  error?: string | null;
  className?: string;
};

export function SectionInlineAlert({
  status,
  error,
  className = "",
}: SectionInlineAlertProps) {
  if (error) {
    return (
      <p
        role="alert"
        className={`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 ${className}`}
      >
        {error}
      </p>
    );
  }

  if (status) {
    return (
      <p
        role="status"
        className={`rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 ${className}`}
      >
        {status}
      </p>
    );
  }

  return null;
}
