import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  createDriverDailyCheckRequestSchema,
  createDriverFuelEntryRequestSchema,
  submitDailyCheckRequestSchema,
} from '@fleet-fuel/shared';

import { authMiddleware, driverSurfaceAuthMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';
import { prisma } from '../db/prisma';
import {
  createDriverDailyCheckEntry,
  createDriverFuelEntry,
  getDriverDashboard,
  storeDriverReceipt,
  submitDriverDailyCheckEntry,
} from '../services/driver.service';
import { getChecklistMaster } from '../services/daily-checklist.service';
import { asyncHandler } from '../utils/http';
import { AppError } from '../utils/errors';

export const driverRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

const paramsSchema = z.object({
  id: z.string().uuid(),
});

driverRouter.use(tenantMiddleware);
driverRouter.use(authMiddleware);
driverRouter.use(driverSurfaceAuthMiddleware);

driverRouter.get(
  '/vehicles',
  asyncHandler(async (req, res) => {
    const rows = await prisma.vehicle.findMany({
      where: {
        tenantId: req.tenant!.id,
        isActive: true,
      },
      orderBy: [{ fleetNumber: 'asc' }],
      take: 100,
      select: {
        id: true,
        fleetNumber: true,
        plateNumber: true,
      },
    });

    const vehicleIds = rows.map((row) => row.id);
    const latestOdometerByVehicle = new Map<string, number | null>();
    if (vehicleIds.length > 0) {
      const latestOdometerRows = await prisma.fuelEntry.findMany({
        where: {
          tenantId: req.tenant!.id,
          vehicleId: { in: vehicleIds },
          odometerKm: { not: null },
        },
        orderBy: [{ vehicleId: 'asc' }, { entryDate: 'desc' }, { createdAt: 'desc' }],
        distinct: ['vehicleId'],
        select: {
          vehicleId: true,
          odometerKm: true,
        },
      });
      for (const odometerRow of latestOdometerRows) {
        latestOdometerByVehicle.set(odometerRow.vehicleId, odometerRow.odometerKm);
      }
    }

    res.json({
      items: rows.map((row) => ({
        id: row.id,
        fleet_no: row.fleetNumber,
        plate_no: row.plateNumber,
        previous_odometer_km: latestOdometerByVehicle.get(row.id) ?? null,
      })),
      request_id: req.requestId,
    });
  }),
);

driverRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const summary = await getDriverDashboard(req.tenant!.id, req.auth!.sub, req.requestId);
    res.json(summary);
  }),
);

driverRouter.get(
  '/checklists/master',
  asyncHandler(async (req, res) => {
    const result = await getChecklistMaster(req.requestId);
    res.json(result);
  }),
);

driverRouter.post(
  '/daily-checks',
  asyncHandler(async (req, res) => {
    const payload = createDriverDailyCheckRequestSchema.parse(req.body);
    const created = await createDriverDailyCheckEntry(req.tenant!.id, req.auth!.sub, payload);
    res.status(201).json({
      id: created.id,
      status: created.status,
      request_id: req.requestId,
    });
  }),
);

driverRouter.put(
  '/daily-checks/:id/submit',
  asyncHandler(async (req, res) => {
    const params = paramsSchema.parse(req.params);
    const payload = submitDailyCheckRequestSchema.parse(req.body);
    const updated = await submitDriverDailyCheckEntry(req.tenant!.id, req.auth!.sub, params.id, payload);
    res.json({
      id: updated.id,
      status: updated.status,
      request_id: req.requestId,
    });
  }),
);

driverRouter.post(
  '/fuel-entries',
  asyncHandler(async (req, res) => {
    const payload = createDriverFuelEntryRequestSchema.parse(req.body);
    const created = await createDriverFuelEntry(req.tenant!.id, req.auth!.sub, payload);
    res.status(201).json({
      ...created,
      request_id: req.requestId,
    });
  }),
);

driverRouter.post(
  '/receipts/upload',
  upload.single('receipt'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError(400, 'file_required', 'Upload a receipt using multipart field "receipt".');
    }

    const uploaded = await storeDriverReceipt(
      req.tenant!.id,
      req.auth!.sub,
      req.file.originalname,
      req.file.mimetype,
      req.file.buffer,
    );

    res.status(201).json({
      ...uploaded,
      request_id: req.requestId,
    });
  }),
);
