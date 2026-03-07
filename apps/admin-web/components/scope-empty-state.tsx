'use client';

export function ScopeEmptyState() {
  return (
    <section className="card" data-testid="no-site-scope-state">
      <h2>No site scope assigned</h2>
      <p className="status">no_site_scope_assigned</p>
      <p>Your account is limited to assigned sites. Contact an operations administrator to assign one or more sites.</p>
    </section>
  );
}
