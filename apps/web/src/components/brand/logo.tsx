// The orchadOS mark: a pistachio leaf in a rounded square.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <rect width="32" height="32" rx="9" fill="#2f6b2a" />
      <path
        d="M9 22.5c0-7.5 5.5-13 14-13.5-.4 8.6-5.9 14-13.5 14-.2 0-.5 0-.5-.5Z"
        fill="#b9dc8f"
      />
      <path d="M9.6 22.4 18.5 13.5" stroke="#2f6b2a" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
