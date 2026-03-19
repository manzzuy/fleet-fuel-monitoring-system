'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { TenantStaffRole } from '../lib/tenant-session';
import { getTenantRole } from '../lib/tenant-session';
import { formatRoleLabel, isSafetyOfficerRole, isSiteSupervisorRole } from '../lib/roles';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard' },
  { href: '/alerts', label: 'Alerts', testId: 'nav-alerts' },
  { href: '/fuel', label: 'Fuel', testId: 'nav-fuel' },
  { href: '/daily-checks', label: 'Daily Checks', testId: 'nav-daily-checks' },
  { href: '/vehicles', label: 'Vehicles', testId: 'nav-vehicles' },
  { href: '/drivers', label: 'Users', testId: 'nav-drivers' },
  { href: '/sites', label: 'Sites', testId: 'nav-sites' },
  { href: '/tanks', label: 'Tanks', testId: 'nav-tanks' },
  { href: '/settings', label: 'Settings', testId: 'nav-settings' },
];

function getNavItems(role: TenantStaffRole | null) {
  if (isSiteSupervisorRole(role)) {
    return navItems.filter((item) =>
      ['/dashboard', '/daily-checks', '/fuel', '/drivers', '/vehicles'].includes(item.href),
    );
  }
  if (isSafetyOfficerRole(role)) {
    return navItems.filter((item) =>
      ['/dashboard', '/daily-checks', '/fuel', '/drivers', '/vehicles', '/alerts'].includes(item.href),
    );
  }
  return navItems;
}

interface TenantSidebarLayoutProps {
  subdomain: string;
  role?: TenantStaffRole | null;
  title: string;
  description: string;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function TenantSidebarLayout({
  subdomain,
  role = null,
  title,
  description,
  onSignOut,
  children,
}: TenantSidebarLayoutProps) {
  const pathname = usePathname();
  const [tokenRole, setTokenRole] = useState<TenantStaffRole | null>(null);

  useEffect(() => {
    const storedRole = getTenantRole(subdomain);
    setTokenRole(storedRole);
  }, [subdomain]);

  const effectiveRole = role ?? tokenRole;
  const visibleNavItems = getNavItems(effectiveRole);

  return (
    <div className="tenant-layout" data-testid="tenant-layout">
      <aside className="tenant-sidebar" data-testid="tenant-sidebar">
        <div className="tenant-brand">
          <p className="eyebrow">Operations</p>
          <h2>{subdomain}</h2>
        </div>
        <nav className="tenant-nav" data-testid="tenant-sidebar-nav">
          {visibleNavItems.map((item) => (
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
            <div className="tenant-session-meta" data-testid="tenant-session-meta">
              <span>Tenant: {subdomain}</span>
              <span>Signed in as: {formatRoleLabel(effectiveRole)}</span>
            </div>
          </div>
        </section>
        {children}
      </div>
    </div>
  );
}
