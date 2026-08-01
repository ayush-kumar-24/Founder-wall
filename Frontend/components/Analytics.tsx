import Script from "next/script";

/**
 * Google Analytics — loads only when NEXT_PUBLIC_GA_ID is set at build time.
 * With no id configured it renders nothing, so production is never affected.
 */
export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim();
  if (!gaId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${gaId}');`}
      </Script>
    </>
  );
}
