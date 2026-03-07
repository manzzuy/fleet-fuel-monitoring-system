'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard' },
  { href: '/alerts', label: 'Alerts', testId: 'nav-alerts' },
  { href: '/fuel', label: 'Fuel', testId: 'nav-fuel' },
  { href: '/daily-checks', label: 'Daily Checks', testId: 'nav-daily-checks' },
  { href: '/vehicles', label: 'Vehicles', testId: 'nav-vehicles' },
  { href: '/drivers', label: 'Drivers', testId: 'nav-drivers' },
  { href: '/sites', label: 'Sites', testId: 'nav-sites' },
  { href: '/tanks', label: 'Tanks', testId: 'nav-tanks' },
  { href: '/settings', label: 'Settings', testId: 'nav-settings' },
];

interface TenantSidebarLayoutProps {
  subdomain: string;
  title: string;
  description: string;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function TenantSidebarLayout({
  subdomain,
  title,
  description,
  onSignOut,
  children,
}: TenantSidebarLayoutProps) {
  const pathname = usePathname();

  return (
    <div className="tenant-layout" data-testid="tenant-layout">
      <aside className="tenant-sidebar" data-testid="tenant-sidebar">
        <div className="tenant-brand">
          <p className="eyebrow">Operations</p>
          <h2>{subdomain}</h2>
        </div>
        <nav className="tenant-nav" data-testid="tenant-sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? 'tenant-nav-item active' : 'tenant-nav-item'}
              data-testid={item.testId}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button className="button button-secondary sidebar-signout" onClick={onSignOut} type="button">
          Sign out
        </button>
      </aside>
      <div className="tenant-content" data-testid="tenant-content">
        <section className="card">
          <div className="toolbar">
            <div>
              <p className="eyebrow">Administration</p>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <span className="badge">dev</span>
          </div>
        </section>
        {children}
      </div>
    </div>
  );
}
