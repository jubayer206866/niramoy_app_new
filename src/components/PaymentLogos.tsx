/**
 * Payment-method marks used across the checkout, cart and footer.
 *
 * bKash, Nagad, Visa and Mastercard use the official brand artwork (bundled,
 * so they render offline in the packaged app); the rest are brand-coloured
 * badges. All share the same 112x36 frame so they line up in a row.
 */
import type { ReactNode } from "react";
import bkashMark from "../assets/payments/bkash.png";
import nagadMark from "../assets/payments/nagad.png";

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

function WhiteCard() {
  return <rect x=".5" y=".5" width="111" height="35" rx="8.5" fill="#fff" stroke="#E2E8F0" />;
}

export function BkashLogo({ className }: LogoProps) {
  return (
    <Frame label="bKash" className={className}>
      <WhiteCard />
      <image href={bkashMark} x="4" y="3" width="104" height="30" />
    </Frame>
  );
}

export function NagadLogo({ className }: LogoProps) {
  return (
    <Frame label="Nagad" className={className}>
      <WhiteCard />
      <image href={nagadMark} x="4" y="4" width="104" height="28" />
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
      <WhiteCard />
      <svg x="20" y="8" width="72" height="20" viewBox="0 0 1000 324.68">
        <path
          fill="#1434CB"
          d="m651.19.5c-70.93,0-134.32,36.77-134.32,104.69,0,77.9,112.42,83.28,112.42,122.42,0,16.48-18.88,31.23-51.14,31.23-45.77,0-79.98-20.61-79.98-20.61l-14.64,68.55s39.41,17.41,91.73,17.41c77.55,0,138.58-38.57,138.58-107.66,0-82.32-112.89-87.54-112.89-123.86,0-12.91,15.5-27.05,47.66-27.05,36.29,0,65.89,14.99,65.89,14.99l14.33-66.2S696.61.5,651.18.5h0ZM2.22,5.5L.5,15.49s29.84,5.46,56.72,16.36c34.61,12.49,37.07,19.77,42.9,42.35l63.51,244.83h85.14L379.93,5.5h-84.94l-84.28,213.17-34.39-180.7c-3.15-20.68-19.13-32.48-38.68-32.48,0,0-135.41,0-135.41,0Zm411.87,0l-66.63,313.53h81L494.85,5.5h-80.76Zm451.76,0c-19.53,0-29.88,10.46-37.47,28.73l-118.67,284.8h84.94l16.43-47.47h103.48l9.99,47.47h74.95L934.12,5.5h-68.27Zm11.05,84.71l25.18,117.65h-67.45l42.28-117.65h0Z"
        />
      </svg>
    </Frame>
  );
}

export function MastercardLogo({ className }: LogoProps) {
  return (
    <Frame label="Mastercard" className={className}>
      <WhiteCard />
      <svg x="34" y="5" width="44" height="26" viewBox="0 0 1000 618">
        <circle cx="309" cy="309" r="309" fill="#EB001B" />
        <circle cx="691" cy="309" r="309" fill="#F79E1B" />
        <path fill="#FF5F00" d="M500 66a309 309 0 0 0 0 486a309 309 0 0 0 0-486z" />
      </svg>
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
