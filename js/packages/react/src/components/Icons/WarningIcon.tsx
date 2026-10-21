import type { SVGProps } from "react";

export function WarningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      className={`idkit-warning-svg ${props.className ?? ""}`.trim()}
    >
      <g clipPath="url(#clip0_4850_18553)">
        <path
          d="M28 31.4904V19.282M32.0908 9.84339L48.7665 39.8036C50.4978 42.9142 48.2488 46.7399 44.6889 46.7399H11.66C8.11715 46.7399 5.86641 42.9472 7.56382 39.8374L23.917 9.87713C25.6778 6.65123 30.3035 6.63214 32.0908 9.84339Z"
          stroke="currentColor"
          strokeWidth="4"
          strokeMiterlimit="10"
        />
        <path
          d="M27.9983 39.6766C29.5176 39.6766 30.7492 38.4448 30.7492 36.9252C30.7492 35.4057 29.5176 34.1738 27.9983 34.1738C26.4791 34.1738 25.2475 35.4057 25.2475 36.9252C25.2475 38.4448 26.4791 39.6766 27.9983 39.6766Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_4850_18553">
          <rect width="56" height="56" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
