'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/daily-checks', label: 'Check', icon: '📋' },
  { href: '/fuel-entry', label: 'Fuel', icon: '⛽' },
];

interface DriverShellProps {
  subdomain: string;
  title: string;
  subtitle: string;
  onSignOut: () => void;
  children: React.ReactNode;
  compactTop?: boolean;
}

export function DriverShell({ subdomain, title, subtitle, onSignOut, children, compactTop = false }: DriverShellProps) {
  const pathname = usePathname();
  const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  function hapticTap() {
    if (canVibrate) {
      navigator.vibrate(8);
    }
  }

  return (
    <main className="driver-shell">
      {!compactTop ? (
        <>
          <section className="hero native-app-header">
            <div>
              <p className="eyebrow">Driver tenant</p>
              <h1>{subdomain}</h1>
            </div>
            <span className="native-badge">Ready</span>
          </section>
          <section className="panel">
            <div className="toolbar">
              <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </div>
              <button
                className="button ghost compact native-signout"
                onClick={() => {
                  hapticTap();
                  onSignOut();
                }}
                type="button"
              >
                Sign out
              </button>
            </div>
          </section>
        </>
      ) : (
        <section className="sr-only-driver-header" aria-hidden="true">
          <span>{subdomain}</span>
          <span>{title}</span>
          <span>{subtitle}</span>
        </section>
      )}
      <section className="driver-content">{children}</section>
      <nav aria-label="Primary" className="tab-nav native-tab-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            className={pathname === item.href ? 'tab active native-tab' : 'tab native-tab'}
            href={item.href}
            onClick={() => hapticTap()}
          >
            <span aria-hidden="true" className="native-tab-icon">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
