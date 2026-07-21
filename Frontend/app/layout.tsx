import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "the wall",
  description: "a room that holds what founders carry",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw into the notch / Dynamic Island / cutout region; content is then held
  // clear of it with env(safe-area-inset-*) in CSS.
  viewportFit: "cover",
  // The room is warm umber, never black — match the browser chrome to it so
  // there is no flash of white behind the collapsing address bar.
  themeColor: "#100d0b",
  // user scaling is intentionally left enabled for accessibility (pinch-zoom);
  // the canvas itself opts out via touch-action so gestures drive the camera.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Plain stylesheet so family names are addressable from canvas 2D.
            Patrick Hand: legible handwriting for the notes.
            Caveat: kept for flavor fallback. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Patrick+Hand&family=Caveat:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
