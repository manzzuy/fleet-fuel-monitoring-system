export interface E2ECredentials {
  subdomain: string;
  username: string;
  email: string;
  password: string;
}

export interface E2EDriverCredentials {
  subdomain: string;
  username: string;
  password: string;
}

function read(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() ?? fallback;
  if (!value) {
    throw new Error(`Missing required E2E environment variable: ${name}`);
  }
  return value;
}

export function getE2ECredentials(): E2ECredentials {
  return {
    subdomain: read('E2E_TENANT_SUBDOMAIN').toLowerCase(),
    username: read('E2E_ADMIN_USERNAME').toLowerCase(),
    email: read('E2E_ADMIN_EMAIL').toLowerCase(),
    password: read('E2E_ADMIN_PASSWORD'),
  };
}

export function getTenantAdminBaseUrl(): string {
  const { subdomain } = getE2ECredentials();
  return `http://${subdomain}.platform.test:3000`;
}

export function tryGetE2EDriverCredentials(): E2EDriverCredentials | null {
  const subdomain = process.env.E2E_TENANT_SUBDOMAIN?.trim().toLowerCase();
  const username = process.env.E2E_DRIVER_USERNAME?.trim().toLowerCase();
  const password = process.env.E2E_DRIVER_PASSWORD?.trim();

  if (!subdomain || !username || !password) {
    return null;
  }

  return { subdomain, username, password };
}

export function getTenantDriverBaseUrl(): string {
  const credentials = tryGetE2EDriverCredentials();
  if (!credentials) {
    throw new Error('Missing E2E driver credentials. Set E2E_DRIVER_USERNAME and E2E_DRIVER_PASSWORD.');
  }
  return `http://${credentials.subdomain}.platform.test:3001`;
}
