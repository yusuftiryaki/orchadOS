import type { SVGProps } from "react";

// A small stroke icon set (24px grid, 1.75 stroke, round joins) drawn for
// orchadOS in the style of common open icon sets. Icons are decorative:
// always next to a text label, so they are aria-hidden.
type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

// A tree seen from the side: the gardens.
export function IconTree(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21v-6" />
      <path d="M12 15c-4 0-6.5-2.3-6.5-5.4A5.6 5.6 0 0 1 12 4a5.6 5.6 0 0 1 6.5 5.6c0 3.1-2.5 5.4-6.5 5.4Z" />
      <path d="M9 21h6" />
    </Svg>
  );
}

export function IconClipboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5V3.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8v.7" />
      <path d="M9 11h6M9 15h4" />
    </Svg>
  );
}

export function IconPackage(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 8.2 12 3 3 8.2v7.6L12 21l9-5.2Z" />
      <path d="m3 8.2 9 5.2 9-5.2M12 13.4V21" />
    </Svg>
  );
}

export function IconCard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 15h3" />
    </Svg>
  );
}

export function IconTool(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14.7 6.3a4 4 0 0 0 5 5L21 12.6l-1.3-1.3M14.7 6.3 13.4 5l1.3-1.3a4 4 0 0 0-5 5L3.6 14.8a2 2 0 1 0 2.8 2.8L12.5 11.5" />
    </Svg>
  );
}

export function IconFileText(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </Svg>
  );
}

export function IconUser(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </Svg>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6Z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </Svg>
  );
}

export function IconLogOut(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Svg>
  );
}

export function IconGrid(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}

export function IconArrowLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconMapPin(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Svg>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Svg>
  );
}

export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.3 4.1 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4M12 17h.01" />
    </Svg>
  );
}

export function IconInfo(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12M7 10l5 5 5-5M4 19.5h16" />
    </Svg>
  );
}

export function IconCamera360(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="12" rx="9" ry="4.5" />
      <path d="M12 3c2.5 2.3 3.8 5.4 3.8 9s-1.3 6.7-3.8 9M12 3C9.5 5.3 8.2 8.4 8.2 12s1.3 6.7 3.8 9" />
    </Svg>
  );
}

export function IconMessage(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 12a8 8 0 0 1-11.7 7.1L4 20.5l1.4-4.6A8 8 0 1 1 20.5 12Z" />
    </Svg>
  );
}

export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.4A6.5 6.5 0 0 1 21.5 20" />
    </Svg>
  );
}

// Wave 4, auth screens: the password visibility toggle and the login methods.
export function IconEye(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function IconEyeOff(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.5 7.4A16.5 16.5 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </Svg>
  );
}

export function IconMail(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </Svg>
  );
}

export function IconPhone(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Svg>
  );
}

// Wave 4, public site: link arrows and the phone menu button.
export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
