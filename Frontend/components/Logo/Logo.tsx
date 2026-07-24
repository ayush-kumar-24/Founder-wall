"use client";

import { useState } from "react";

/**
 * GoXL brand logo. Renders the official logo from `public/Goxl-Entrepreneurship.png`.
 * If that file is missing, it falls back to a vector emblem so the UI never
 * breaks.
 */
export default function Logo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (!failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/Goxl-Entrepreneurship.png"
        alt="GoXL Entrepreneurship"
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }

  // Fallback emblem (shown only until the real logo file exists).
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      role="img"
      aria-label="GoXL"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="goxl-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9BD24F" />
          <stop offset="1" stopColor="#3E9B3A" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#goxl-mark)" />
      <g fill="#ffffff" opacity="0.95">
        <rect x="9" y="14.5" width="22" height="3.4" rx="1.7" />
        <rect x="9" y="20.3" width="16.5" height="3.4" rx="1.7" />
        <rect x="9" y="26.1" width="11" height="3.4" rx="1.7" />
      </g>
    </svg>
  );
}
