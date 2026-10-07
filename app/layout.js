import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata = {
  title: 'ISS Live-Tracker',
  description: 'Live-Position der Internationalen Raumstation auf einer Karte.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Setzt data-theme vor dem ersten Paint, sonst blitzt bei dunklem System kurz
// die helle Oberfläche auf. Muss deshalb inline und synchron im Body-Anfang
// stehen — ein Effekt aus React liefe erst nach dem ersten Paint.
const THEME_SCRIPT = `(function(){var t='light';try{var s=localStorage.getItem('iss-tracker-theme');if(s==='dark'){t='dark';}else if(s!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches){t='dark';}}catch(e){try{if(matchMedia('(prefers-color-scheme: dark)').matches){t='dark';}}catch(e2){}}document.documentElement.setAttribute('data-theme',t);})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
