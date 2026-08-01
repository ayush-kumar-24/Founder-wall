import type { Metadata, Viewport } from "next";
import "./globals.css";
import Analytics from "@/components/Analytics";

const SITE_URL = "https://founderwall.goxl.in";
const SITE_NAME = "Founder's Wall";
const DESCRIPTION =
  "Founder's Wall is an anonymous community by GoXL where startup founders share the problems, questions, and wins they can't say out loud — real advice, zero judgment.";
const TITLE = "Founder's Wall | Anonymous Founder Community by GoXL";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | Founder's Wall",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Founder's Wall",
    "founder community",
    "startup community",
    "anonymous founder",
    "entrepreneurship",
    "founder problems",
    "startup advice",
    "founder network",
    "GoXL",
  ],
  authors: [{ name: "GoXL", url: "https://goxl.in" }],
  creator: "GoXL",
  publisher: "GoXL",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  category: "community",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Match the browser chrome to the paper so there's no white flash.
  themeColor: "#ece0c4",
};

// Structured data (JSON-LD): identifies GoXL, the site, and this page so search
// and generative engines attribute the entities correctly.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#goxl`,
      name: "GoXL",
      url: "https://goxl.in",
      logo: `${SITE_URL}/Goxl-Entrepreneurship.png`,
      description:
        "GoXL builds tools and communities for founders and entrepreneurs.",
      sameAs: ["https://goxl.in", "https://chat.whatsapp.com/BsZ5WBf1cvpGqpfrZFN8LH"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#goxl` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: TITLE,
      description: DESCRIPTION,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#goxl` },
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Self-hosted fonts (no Google CDN) — preload the two used above the
            fold so text paints in the brand faces with minimal shift. */}
        <link
          rel="preload"
          href="/assets/fonts/Kalam-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/assets/fonts/Caveat-700.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
