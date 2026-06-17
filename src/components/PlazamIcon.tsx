/**
 * Plazam icon — question mark merging into a fork, using currentColor like Lucide icons
 */
export function PlazamIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Question mark arc */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C9.24 2 7 4.02 7 6.5c0 .83.67 1.5 1.5 1.5S10 7.33 10 6.5C10 5.12 10.9 4 12 4s2 1.12 2 2.5c0 1.1-.7 1.8-1.45 2.55C11.6 10 11 10.9 11 12v.5c0 .83.67 1.5 1.5 1.5S14 13.33 14 12.5V12c0-.18.2-.55.7-1.05C15.6 10 17 8.7 17 6.5 17 4.02 14.76 2 12 2z"
      />
      {/* Dot */}
      <circle cx="12" cy="15.5" r="1.25" />
      {/* Fork handle */}
      <rect x="11.25" y="17.25" width="1.5" height="2.25" rx="0.75" />
      {/* Fork base */}
      <rect x="8.5" y="19" width="7" height="1.5" rx="0.75" />
      {/* Fork tines */}
      <rect x="8.75" y="19" width="1.25" height="3" rx="0.625" />
      <rect x="11.375" y="19" width="1.25" height="3" rx="0.625" />
      <rect x="14" y="19" width="1.25" height="3" rx="0.625" />
    </svg>
  );
}
