import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fleet-fuel-platform | Driver',
  description: 'Driver PWA bootstrap surface',
  applicationName: 'Fleet Fuel Driver',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
