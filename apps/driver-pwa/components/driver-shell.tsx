'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/daily-checks', label: 'Daily Check' },
  { href: '/fuel-entry', label: 'Fuel Entry' },
];

interface DriverShellProps {
  subdomain: string;
  title: string;
  subtitle: string;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function DriverShell({ subdomain, title, subtitle, onSignOut, children }: DriverShellProps) {
  const pathname = usePathname();

  return (
    <main className="driver-shell">
      <section className="hero">
        <p className="eyebrow">Driver tenant</p>
        <h1>{subdomain}</h1>
      </section>
      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="button ghost" onClick={onSignOut} type="button">
            Sign out
          </button>
        </div>
      </section>
      <nav className="tab-nav">
        {navItems.map((item) => (
          <Link key={item.href} className={pathname === item.href ? 'tab active' : 'tab'} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
