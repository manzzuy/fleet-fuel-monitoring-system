import { Router } from 'express';
import { z } from 'zod';

import {
  createDailyCheckRequestSchema,
  createNotificationContactRequestSchema,
  createComplianceRecordRequestSchema,
  createComplianceTypeRequestSchema,
  dashboardAlertsQuerySchema,
  createFuelEntryRequestSchema,
  dailyChecksQuerySchema,
  fuelEntriesQuerySchema,
  complianceAppliesToSchema,
  complianceRecordsQuerySchema,
  submitDailyCheckRequestSchema,
  updateNotificationContactRequestSchema,
  updateComplianceTypeRequestSchema,
  updateTenantNotificationSettingsRequestSchema,
  notificationContactAssignmentRequestSchema,
} from '@fleet-fuel/shared';

import { authMiddleware, staffSurfaceAuthMiddleware } from '../middleware/auth';
import { staffScopeMiddleware } from '../middleware/staff-scope';
import { tenantMiddleware } from '../middleware/tenant';
import {
  assignContactToSite,
  createContact,
  ensureCanManageContacts,
  listContacts,
  previewNotificationRecipientResolution,
  removeContactSiteAssignment,
  updateContact,
} from '../services/contact-directory.service';
import {
  createDailyCheck,
  getChecklistMaster,
  getDailyCheckDetails,
  listDailyChecks,
  submitDailyCheck,
} from '../services/daily-checklist.service';
import { getTenantDashboardAlerts } from '../services/alerts.service';
import { getTenantDashboardSummary } from '../services/dashboard.service';
import { createFuelEntry, listFuelEntries } from '../services/fuel.service';
import {
  createMasterDriver,
  createMasterSite,
  createMasterTank,
  createMasterVehicle,
  ensureCanManageMasterData,
  listMasterDrivers,
  listMasterVehicles,
  updateMasterDriver,
  updateMasterSite,
  updateMasterTank,
  updateMasterVehicle,
  resetMasterDriverPassword,
} from '../services/master-data.service';
import {
  listTenantDrivers,
  listTenantSites,
  listTenantTanks,
  listTenantVehicles,
} from '../services/lookup.service';
import {
  getNotificationProviderReadiness,
} from '../services/notification-dispatch.service';
import { getTenantedSystemStatus } from '../services/system-status.service';
import {
  ensureCanViewNotificationConfiguration,
  getTenantSettings,
  updateTenantNotificationSettings,
} from '../services/tenant-settings.service';
import { getTenantProfile, updateTenantProfile } from '../services/tenant-profile.service';
import {
  createComplianceRecord,
  createComplianceType,
  listComplianceRecords,
  listComplianceTypes,
  updateComplianceType,
} from '../services/compliance.service';
import { asyncHandler } from '../utils/http';
import { AppError } from '../utils/errors';

export const tenantedRouter = Router();
const staffAuth = [authMiddleware, staffSurfaceAuthMiddleware, staffScopeMiddleware] as const;
const lookupQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const dailyCheckParamsSchema = z.object({
  id: z.string().uuid(),
});
const complianceTypeParamsSchema = z.object({
  id: z.string().uuid(),
});
const contactParamsSchema = z.object({
  id: z.string().uuid(),
});
const masterIdParamsSchema = z.object({
  id: z.string().uuid(),
});
const operationalUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9._-]+$/, 'Username must use lowercase letters, numbers, dot, underscore, or hyphen only.');
const createMasterDriverSchema = z.object({
  role: z.enum(['DRIVER', 'SITE_SUPERVISOR', 'SAFETY_OFFICER', 'TENANT_ADMIN']).optional(),
  full_name: z.string().trim().min(1),
  employee_no: z.string().trim().min(1).optional().nullable(),
  username: operationalUsernameSchema,
  site_id: z.string().uuid().optional().nullable(),
  site_ids: z.array(z.string().uuid()).optional(),
  assigned_vehicle_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});
const updateMasterDriverSchema = createMasterDriverSchema.partial();
const createMasterVehicleSchema = z.object({
  fleet_no: z.string().trim().min(1),
  plate_no: z.string().trim().min(1).optional().nullable(),
  last_service_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'last_service_date must be in YYYY-MM-DD format.').optional().nullable(),
  last_service_odometer_km: z.number().int().nonnegative().optional().nullable(),
  next_service_odometer_km: z.number().int().nonnegative().optional().nullable(),
  service_interval_km: z.number().int().nonnegative().optional().nullable(),
  site_id: z.string().uuid().optional().nullable(),
  assigned_driver_user_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
});
const updateMasterVehicleSchema = createMasterVehicleSchema.partial();
const createMasterSiteSchema = z.object({
  site_code: z.string().trim().min(1),
  site_name: z.string().trim().min(1),
  location: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
});
const updateMasterSiteSchema = createMasterSiteSchema.partial();
const createMasterTankSchema = z.object({
  tank_name: z.string().trim().min(1),
  capacity_l: z.string().trim().min(1),
  reorder_level_l: z.string().trim().min(1),
  site_id: z.string().uuid(),
});
const updateMasterTankSchema = createMasterTankSchema.partial();
const updateTenantProfileSchema = z.object({
  full_name: z.string().trim().min(1).optional(),
  username: operationalUsernameSchema.optional(),
});
const notificationPreviewQuerySchema = z.object({
  event_type: z.enum(['COMPLIANCE_EXPIRED', 'COMPLIANCE_EXPIRING_SOON']).default('COMPLIANCE_EXPIRING_SOON'),
  site_id: z.string().uuid().optional(),
});

function ensureRestrictedReadOnlyRole(role: string) {
  if (role === 'SITE_SUPERVISOR' || role === 'SAFETY_OFFICER') {
    throw new AppError(403, 'forbidden_read_only_role_write', 'This role has read-only access.');
  }
}

function ensureRestrictedRolePageAccess(role: string, area: 'settings' | 'sites' | 'tanks') {
  if (role === 'SITE_SUPERVISOR' || role === 'SAFETY_OFFICER') {
    throw new AppError(
      403,
      `forbidden_${area}_access`,
      `${role === 'SITE_SUPERVISOR' ? 'Site supervisors' : 'Safety officers'} cannot access ${area}.`,
    );
  }
}

tenantedRouter.use(tenantMiddleware);

tenantedRouter.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tenant_id: req.tenant!.id,
    subdomain: req.tenant!.subdomain,
    request_id: req.requestId,
  });
});

tenantedRouter.get(
  '/system/status',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const status = await getTenantedSystemStatus(req.requestId);
    res.json(status);
  }),
);

tenantedRouter.get(
  '/profile',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const profile = await getTenantProfile(req.tenant!.id, req.auth!.sub);
    res.json({
      item: profile,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.patch(
  '/profile',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const payload = updateTenantProfileSchema.parse(req.body);
    const profile = await updateTenantProfile({
      tenantId: req.tenant!.id,
      userId: req.auth!.sub,
      auth: req.auth!,
      payload,
    });
    res.json({
      item: profile,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/compliance/types',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = z.object({ applies_to: complianceAppliesToSchema.optional() }).parse(req.query);
    const items = await listComplianceTypes(req.tenant!.id, query.applies_to);
    res.json({
      items,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/compliance/types',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const payload = createComplianceTypeRequestSchema.parse(req.body);
    const created = await createComplianceType(req.tenant!.id, payload);
    res.status(201).json({
      item: created,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/compliance/types/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const params = complianceTypeParamsSchema.parse(req.params);
    const payload = updateComplianceTypeRequestSchema.parse(req.body);
    const updated = await updateComplianceType(req.tenant!.id, params.id, payload);
    res.json({
      item: updated,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/compliance/records',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = complianceRecordsQuerySchema.parse(req.query);
    const items = await listComplianceRecords(req.tenant!.id, req.dataScope!, query);
    res.json({
      items,
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/compliance/records',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedReadOnlyRole(req.auth!.role);
    const payload = createComplianceRecordRequestSchema.parse(req.body);
    const created = await createComplianceRecord({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      scope: req.dataScope!,
      payload,
      route: '/tenanted/compliance/records',
    });
    res.status(201).json({
      item: created,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/vehicles',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = lookupQuerySchema.parse(req.query);
    const vehicles = await listTenantVehicles(req.tenant!.id, req.dataScope!, query.search, query.limit);

    res.json({
      items: vehicles.map((vehicle) => ({
        id: vehicle.id,
        fleet_no: vehicle.fleetNumber,
        plate_no: vehicle.plateNumber,
        site: vehicle.site
          ? {
              id: vehicle.site.id,
              site_code: vehicle.site.siteCode,
              site_name: vehicle.site.siteName,
            }
          : null,
      })),
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/drivers',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = lookupQuerySchema.parse(req.query);
    const drivers = await listTenantDrivers(req.tenant!.id, req.dataScope!, query.search, query.limit);

    res.json({
      items: drivers.map((driver) => ({
        id: driver.id,
        full_name: driver.fullName,
        employee_no: driver.employeeNo,
        username: driver.username,
      })),
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/master-data/drivers',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = lookupQuerySchema.parse(req.query);
    const items = await listMasterDrivers(req.tenant!.id, req.dataScope!, query.search, query.limit);
    res.json({
      items,
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/master-data/drivers',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const payload = createMasterDriverSchema.parse(req.body);
    const id = await createMasterDriver({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      actorRole: req.auth!.role,
      payload,
    });
    res.status(201).json({
      id,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/master-data/drivers/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const params = masterIdParamsSchema.parse(req.params);
    const payload = updateMasterDriverSchema.parse(req.body);
    await updateMasterDriver({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      actorRole: req.auth!.role,
      scope: req.dataScope!,
      id: params.id,
      route: '/tenanted/master-data/drivers/:id',
      payload,
    });
    res.json({
      ok: true,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/master-data/drivers/:id/reset-password',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const params = masterIdParamsSchema.parse(req.params);
    const result = await resetMasterDriverPassword({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      actorRole: req.auth!.role,
      scope: req.dataScope!,
      id: params.id,
      route: '/tenanted/master-data/drivers/:id/reset-password',
    });
    res.json({
      ...result,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/dashboard/alerts',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = dashboardAlertsQuerySchema.parse(req.query);
    const result = await getTenantDashboardAlerts(req.tenant!, req.dataScope!, query, req.requestId);
    res.json(result);
  }),
);

tenantedRouter.get(
  '/dashboard/summary',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const summary = await getTenantDashboardSummary(req.tenant!, req.dataScope!, req.requestId);
    res.json(summary);
  }),
);

tenantedRouter.post(
  '/fuel-entries',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedReadOnlyRole(req.auth!.role);
    const payload = createFuelEntryRequestSchema.parse(req.body);
    const created = await createFuelEntry(req.tenant!.id, req.auth!.sub, payload);
    res.status(201).json({
      ...created,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/fuel-entries',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = fuelEntriesQuerySchema.parse(req.query);
    const result = await listFuelEntries(req.tenant!.id, req.dataScope!, query);

    res.json({
      items: result.items,
      next_cursor: result.nextCursor,
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/fuel-logs',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = fuelEntriesQuerySchema.parse(req.query);
    const result = await listFuelEntries(req.tenant!.id, req.dataScope!, query);

    res.json({
      items: result.items,
      next_cursor: result.nextCursor,
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/checklists/master',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const result = await getChecklistMaster(req.requestId);
    res.json(result);
  }),
);

tenantedRouter.post(
  '/daily-checks',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedReadOnlyRole(req.auth!.role);
    const payload = createDailyCheckRequestSchema.parse(req.body);
    const created = await createDailyCheck(req.tenant!.id, req.auth!.sub, payload);
    res.status(201).json({
      id: created.id,
      status: created.status,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/daily-checks',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = dailyChecksQuerySchema.parse(req.query);
    const result = await listDailyChecks(req.tenant!.id, req.dataScope!, query, req.requestId);
    res.json({
      ...result,
      scope_status: req.dataScope!.scopeStatus,
    });
  }),
);

tenantedRouter.get(
  '/daily-checks/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const params = dailyCheckParamsSchema.parse(req.params);
    const result = await getDailyCheckDetails(req.tenant!.id, req.dataScope!, req.auth!.sub, params.id, req.requestId);
    res.json({
      ...result,
      scope_status: req.dataScope!.scopeStatus,
    });
  }),
);

tenantedRouter.put(
  '/daily-checks/:id/submit',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedReadOnlyRole(req.auth!.role);
    const params = dailyCheckParamsSchema.parse(req.params);
    const payload = submitDailyCheckRequestSchema.parse(req.body);
    const updated = await submitDailyCheck(req.tenant!.id, params.id, payload);
    res.json({
      id: updated.id,
      status: updated.status,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/sites',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'sites');
    const query = lookupQuerySchema.parse(req.query);
    const sites = await listTenantSites(req.tenant!.id, req.dataScope!, query.search, query.limit);

    res.json({
      items: sites.map((site) => ({
        id: site.id,
        site_code: site.siteCode,
        site_name: site.siteName,
        location: site.location,
        is_active: site.isActive,
      })),
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/master-data/sites',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const payload = createMasterSiteSchema.parse(req.body);
    const id = await createMasterSite({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      payload,
    });
    res.status(201).json({
      id,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/master-data/sites/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const params = masterIdParamsSchema.parse(req.params);
    const payload = updateMasterSiteSchema.parse(req.body);
    await updateMasterSite({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      scope: req.dataScope!,
      id: params.id,
      route: '/tenanted/master-data/sites/:id',
      payload,
    });
    res.json({
      ok: true,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/tanks',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'tanks');
    const query = lookupQuerySchema.parse(req.query);
    const tanks = await listTenantTanks(req.tenant!.id, req.dataScope!, query.search, query.limit);

    res.json({
      items: tanks.map((tank) => ({
        id: tank.id,
        tank_name: tank.tankName,
        capacity_l: tank.capacityL.toString(),
        reorder_level_l: tank.reorderLevelL.toString(),
        site: {
          id: tank.site.id,
          site_code: tank.site.siteCode,
          site_name: tank.site.siteName,
        },
      })),
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/master-data/tanks',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const payload = createMasterTankSchema.parse(req.body);
    const id = await createMasterTank({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      payload,
    });
    res.status(201).json({
      id,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/master-data/tanks/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const params = masterIdParamsSchema.parse(req.params);
    const payload = updateMasterTankSchema.parse(req.body);
    await updateMasterTank({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      scope: req.dataScope!,
      id: params.id,
      route: '/tenanted/master-data/tanks/:id',
      payload,
    });
    res.json({
      ok: true,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/master-data/vehicles',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    const query = lookupQuerySchema.parse(req.query);
    const items = await listMasterVehicles(req.tenant!.id, req.dataScope!, query.search, query.limit);
    res.json({
      items,
      scope_status: req.dataScope!.scopeStatus,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/master-data/vehicles',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const payload = createMasterVehicleSchema.parse(req.body);
    const id = await createMasterVehicle({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      payload,
    });
    res.status(201).json({
      id,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/master-data/vehicles/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureCanManageMasterData(req.auth!, req.dataScope!);
    const params = masterIdParamsSchema.parse(req.params);
    const payload = updateMasterVehicleSchema.parse(req.body);
    await updateMasterVehicle({
      tenantId: req.tenant!.id,
      actorId: req.auth!.sub,
      scope: req.dataScope!,
      id: params.id,
      route: '/tenanted/master-data/vehicles/:id',
      payload,
    });
    res.json({
      ok: true,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.get(
  '/tenant/settings',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    const result = await getTenantSettings(req.tenant!, req.auth!, req.dataScope!, req.requestId);
    res.json(result);
  }),
);

tenantedRouter.get(
  '/notification-contacts',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    ensureCanManageContacts(req.auth!, req.dataScope!);
    const items = await listContacts(req.tenant!.id);
    res.json({
      items,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/notification-contacts',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    ensureCanManageContacts(req.auth!, req.dataScope!);
    const payload = createNotificationContactRequestSchema.parse(req.body);
    const item = await createContact(req.tenant!.id, {
      user_id: payload.user_id,
      name: payload.name,
      role: payload.role,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      is_active: payload.is_active ?? true,
    });
    res.status(201).json({
      item,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/notification-contacts/:id',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    ensureCanManageContacts(req.auth!, req.dataScope!);
    const params = contactParamsSchema.parse(req.params);
    const payload = updateNotificationContactRequestSchema.parse(req.body);
    const item = await updateContact(req.tenant!.id, params.id, {
      user_id: payload.user_id,
      name: payload.name,
      role: payload.role,
      phone: payload.phone,
      email: payload.email,
      is_active: payload.is_active,
    });
    res.json({
      item,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.post(
  '/notification-contacts/:id/sites',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    ensureCanManageContacts(req.auth!, req.dataScope!);
    const params = contactParamsSchema.parse(req.params);
    const payload = notificationContactAssignmentRequestSchema.parse(req.body);
    await assignContactToSite(req.tenant!.id, params.id, payload.site_id);
    const items = await listContacts(req.tenant!.id);
    const item = items.find((entry) => entry.id === params.id) ?? null;
    res.json({
      item,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.delete(
  '/notification-contacts/:id/sites/:siteId',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    ensureCanManageContacts(req.auth!, req.dataScope!);
    const params = z.object({ id: z.string().uuid(), siteId: z.string().uuid() }).parse(req.params);
    await removeContactSiteAssignment(req.tenant!.id, params.id, params.siteId);
    const items = await listContacts(req.tenant!.id);
    const item = items.find((entry) => entry.id === params.id) ?? null;
    res.json({
      item,
      request_id: req.requestId,
    });
  }),
);

tenantedRouter.put(
  '/tenant/settings/notifications',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    const payload = updateTenantNotificationSettingsRequestSchema.parse(req.body);
    const result = await updateTenantNotificationSettings(
      req.tenant!,
      req.auth!,
      req.dataScope!,
      payload,
      req.requestId,
    );
    res.json(result);
  }),
);

tenantedRouter.get(
  '/tenant/settings/notifications/preview',
  ...staffAuth,
  asyncHandler(async (req, res) => {
    ensureRestrictedRolePageAccess(req.auth!.role, 'settings');
    ensureCanViewNotificationConfiguration(req.auth!, req.dataScope!);
    const query = notificationPreviewQuerySchema.parse(req.query);
    const preview = await previewNotificationRecipientResolution({
      tenantId: req.tenant!.id,
      eventType: query.event_type,
      siteId: query.site_id ?? null,
    });
    const readiness = getNotificationProviderReadiness();

    res.json({
      event_type: preview.event_type,
      scope: preview.scope,
      site_id: preview.site_id,
      resolved_recipients: preview.resolved_recipients,
      resolution: {
        source: preview.resolution_source,
        fallback_used: preview.fallback_used,
      },
      provider_readiness: readiness,
      request_id: req.requestId,
    });
  }),
);
