import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** Web document shell. Loads the two faces at the exact optical sizes the kit specifies. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>CareBridge</title>
        <meta name="description" content="Personalized recovery starts before surgery." />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,72,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const css = `
  html, body { background: #F2F4F7; color: #1F2A36; }
  body { min-height: 100vh; font-variant-numeric: tabular-nums; }
  #root { display: flex; min-height: 100vh; }
  * { -webkit-font-smoothing: antialiased; }
  input, textarea, button { font-variant-numeric: tabular-nums; }
  @media print {
    [data-print-hide] { display: none !important; }
  }
`;
