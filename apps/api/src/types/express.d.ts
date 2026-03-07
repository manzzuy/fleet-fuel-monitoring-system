import type { AuthContext, DataScopeContext, TenantContext } from './http';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      tenant?: TenantContext;
      auth?: AuthContext;
      dataScope?: DataScopeContext;
    }
  }
}

export {};
