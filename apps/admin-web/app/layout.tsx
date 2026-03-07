import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'fleet-fuel-platform | Admin',
  description: 'Platform administration bootstrap surface',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
