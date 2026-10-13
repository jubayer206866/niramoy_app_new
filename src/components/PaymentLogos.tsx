/**
 * Inline payment-method marks.
 *
 * These are compact, brand-coloured SVG badges (no external assets, so they
 * render even offline) used across the checkout, cart and footer.
 */
import type { ReactNode } from "react";

type LogoProps = { className?: string };

function Frame({
  label,
  className = "h-6 w-auto",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg viewBox="0 0 112 36" className={className} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

const FONT = "Inter, 'Segoe UI', Arial, sans-serif";

function Wordmark({
  text,
  fill = "#ffffff",
  x = 56,
  size = 17,
  weight = 800,
  italic = false,
}: {
  text: string;
  fill?: string;
  x?: number | string;
  size?: number;
  weight?: number;
  italic?: boolean;
}) {
  return (
    <text
      x={x}
      y="23.5"
      textAnchor="middle"
      fontFamily={FONT}
      fontSize={size}
      fontWeight={weight}
      fontStyle={italic ? "italic" : "normal"}
      fill={fill}
      letterSpacing={italic ? "0.5" : "0"}
    >
      {text}
    </text>
  );
}

export function BkashLogo({ className }: LogoProps) {
  return (
    <Frame label="bKash" className={className}>
      <rect width="112" height="36" rx="9" fill="#E2136E" />
      <Wordmark text="bKash" size={18} />
    </Frame>
  );
}

export function NagadLogo({ className }: LogoProps) {
  return (
    <Frame label="Nagad" className={className}>
      <rect width="112" height="36" rx="9" fill="#EE3D2E" />
      <circle cx="9" cy="18" r="3.4" fill="#fff" opacity=".9" />
      <Wordmark text="Nagad" x="60" size={18} />
    </Frame>
  );
}

export function RocketLogo({ className }: LogoProps) {
  return (
    <Frame label="Rocket" className={className}>
      <rect width="112" height="36" rx="9" fill="#8C3494" />
      <path d="M14 23c-2-5 0-9 4-11l3-1 1 3c1 4-1 8-5 10z" fill="#fff" opacity=".92" />
      <Wordmark text="Rocket" x="62" size={17} />
    </Frame>
  );
}

export function VisaLogo({ className }: LogoProps) {
  return (
    <Frame label="Visa" className={className}>
      <rect width="112" height="36" rx="9" fill="#fff" stroke="#E2E8F0" />
      <Wordmark text="VISA" fill="#1A1F71" size={20} weight={800} italic />
    </Frame>
  );
}

export function MastercardLogo({ className }: LogoProps) {
  return (
    <Frame label="Mastercard" className={className}>
      <rect width="112" height="36" rx="9" fill="#fff" stroke="#E2E8F0" />
      <circle cx="40" cy="18" r="11" fill="#EB001B" />
      <circle cx="56" cy="18" r="11" fill="#F79E1B" fillOpacity=".92" />
      <Wordmark text="mastercard" fill="#231F20" x="86" size={10} weight={700} />
    </Frame>
  );
}

export function AmexLogo({ className }: LogoProps) {
  return (
    <Frame label="American Express" className={className}>
      <rect width="112" height="36" rx="9" fill="#2E77BC" />
      <Wordmark text="AMEX" size={19} />
    </Frame>
  );
}

export function CodLogo({ className }: LogoProps) {
  return (
    <Frame label="Cash on delivery" className={className}>
      <rect width="112" height="36" rx="9" fill="#0F9D58" />
      <rect x="10" y="12" width="18" height="12" rx="2" fill="#fff" opacity=".9" />
      <circle cx="19" cy="18" r="3" fill="#0F9D58" />
      <Wordmark text="Cash" x="66" size={17} />
    </Frame>
  );
}

/** Ordered list used by the footer trust strip. */
export const PAYMENT_MARKS = [
  { id: "bkash", label: "bKash", Logo: BkashLogo },
  { id: "nagad", label: "Nagad", Logo: NagadLogo },
  { id: "rocket", label: "Rocket", Logo: RocketLogo },
  { id: "visa", label: "Visa", Logo: VisaLogo },
  { id: "mastercard", label: "Mastercard", Logo: MastercardLogo },
  { id: "amex", label: "American Express", Logo: AmexLogo },
  { id: "cod", label: "Cash on delivery", Logo: CodLogo },
] as const;
