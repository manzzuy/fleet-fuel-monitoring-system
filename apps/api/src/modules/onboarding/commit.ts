import { Prisma } from '@prisma/client';

import { hashPassword } from '../../utils/password';
import type { OnboardingValidationResult } from './types';

export async function commitOnboardingPreview(
  tx: Prisma.TransactionClient,
  companyId: string,
  preview: OnboardingValidationResult,
) {
  for (const row of preview.normalized.Sites) {
    await tx.site.upsert({
      where: {
        tenantId_siteCode: {
          tenantId: companyId,
          siteCode: row.siteCode,
        },
      },
      update: {
        siteName: row.siteName,
        location: row.location,
      },
      create: {
        tenantId: companyId,
        siteCode: row.siteCode,
        siteName: row.siteName,
        location: row.location,
      },
    });
  }

  const sites = await tx.site.findMany({
    where: { tenantId: companyId },
    select: { id: true, siteCode: true },
  });
  const siteByCode = new Map(sites.map((site) => [site.siteCode.toLowerCase(), site.id]));

  for (const row of preview.normalized.Drivers) {
    const username = row.employeeNo.toLowerCase();
    const temporaryPassword = `${row.employeeNo}!Temp`;
    const passwordHash = await hashPassword(temporaryPassword);

    const user = await tx.user.upsert({
      where: {
        tenantId_employeeNo: {
          tenantId: companyId,
          employeeNo: row.employeeNo,
        },
      },
      update: {
        role: row.role,
        fullName: row.fullName,
        email: row.email,
        username,
        isActive: true,
        passwordHash,
      },
      create: {
        tenantId: companyId,
        employeeNo: row.employeeNo,
        role: row.role,
        fullName: row.fullName,
        email: row.email,
        username,
        passwordHash,
      },
    });

    await tx.userAuth.upsert({
      where: { userId: user.id },
      update: {
        passwordHash,
        forcePasswordChange: true,
      },
      create: {
        userId: user.id,
        passwordHash,
        forcePasswordChange: true,
      },
    });

    await tx.driverProfile.upsert({
      where: { userId: user.id },
      update: {
        tenantId: companyId,
        drivingLicenseNo: row.drivingLicenseNo,
        drivingLicenseExpiry: row.drivingLicenseExpiry,
        opalNo: row.opalNo,
        opalExpiry: row.opalExpiry,
      },
      create: {
        tenantId: companyId,
        userId: user.id,
        drivingLicenseNo: row.drivingLicenseNo,
        drivingLicenseExpiry: row.drivingLicenseExpiry,
        opalNo: row.opalNo,
        opalExpiry: row.opalExpiry,
      },
    });
  }

  for (const row of preview.normalized.Vehicles_Cards) {
    const vehicle = await tx.vehicle.upsert({
      where: {
        tenantId_fleetNumber: {
          tenantId: companyId,
          fleetNumber: row.fleetNo,
        },
      },
      update: {
        plateNumber: row.plateNo,
        vehicleType: row.vehicleType,
        siteId: row.siteCode ? siteByCode.get(row.siteCode) ?? null : null,
      },
      create: {
        tenantId: companyId,
        fleetNumber: row.fleetNo,
        plateNumber: row.plateNo,
        vehicleType: row.vehicleType,
        siteId: row.siteCode ? siteByCode.get(row.siteCode) ?? null : null,
      },
    });

    if (row.cardNumber) {
      await tx.fuelCard.upsert({
        where: {
          tenantId_cardNumber: {
            tenantId: companyId,
            cardNumber: row.cardNumber,
          },
        },
        update: {
          provider: row.cardType,
          assignedVehicleId: vehicle.id,
          isActive: row.cardStatus === 'ACTIVE',
        },
        create: {
          tenantId: companyId,
          cardNumber: row.cardNumber,
          provider: row.cardType,
          assignedVehicleId: vehicle.id,
          isActive: row.cardStatus === 'ACTIVE',
        },
      });
    }
  }

  for (const row of preview.normalized.Tanks) {
    const siteId = siteByCode.get(row.siteCode);
    if (!siteId) {
      continue;
    }
    await tx.tank.upsert({
      where: {
        tenantId_siteId_tankName: {
          tenantId: companyId,
          siteId,
          tankName: row.tankName,
        },
      },
      update: {
        capacityL: new Prisma.Decimal(row.capacityL),
        reorderLevelL: new Prisma.Decimal(row.reorderLevelL),
      },
      create: {
        tenantId: companyId,
        siteId,
        tankName: row.tankName,
        capacityL: new Prisma.Decimal(row.capacityL),
        reorderLevelL: new Prisma.Decimal(row.reorderLevelL),
      },
    });
  }

  for (const row of preview.normalized.Equipment) {
    await tx.equipment.upsert({
      where: {
        tenantId_equipmentCode: {
          tenantId: companyId,
          equipmentCode: row.equipmentCode,
        },
      },
      update: {
        equipmentName: row.equipmentName,
        siteId: row.siteCode ? siteByCode.get(row.siteCode) ?? null : null,
      },
      create: {
        tenantId: companyId,
        equipmentCode: row.equipmentCode,
        equipmentName: row.equipmentName,
        siteId: row.siteCode ? siteByCode.get(row.siteCode) ?? null : null,
      },
    });
  }

  const users = await tx.user.findMany({
    where: { tenantId: companyId },
    select: { id: true, employeeNo: true, role: true },
  });
  const userByEmployeeNo = new Map(
    users
      .filter((user) => user.employeeNo)
      .map((user) => [user.employeeNo!.toLowerCase(), { id: user.id, role: user.role }]),
  );

  for (const row of preview.normalized.Driver_Compliance) {
    const user = userByEmployeeNo.get(row.employeeNo);
    if (!user) {
      continue;
    }
    await tx.driverCredential.upsert({
      where: {
        tenantId_userId_credentialType: {
          tenantId: companyId,
          userId: user.id,
          credentialType: row.credentialType,
        },
      },
      update: {
        credentialNumber: row.credentialNumber,
        expiryDate: row.expiryDate,
      },
      create: {
        tenantId: companyId,
        userId: user.id,
        credentialType: row.credentialType,
        credentialNumber: row.credentialNumber,
        expiryDate: row.expiryDate,
      },
    });
  }

  for (const row of preview.normalized.Supervisor_Sites) {
    const supervisor = userByEmployeeNo.get(row.supervisorEmployeeNo);
    const siteId = siteByCode.get(row.siteCode);
    if (!supervisor || supervisor.role !== 'SITE_SUPERVISOR' || !siteId) {
      continue;
    }
    await tx.supervisorSite.upsert({
      where: {
        tenantId_supervisorUserId_siteId: {
          tenantId: companyId,
          supervisorUserId: supervisor.id,
          siteId,
        },
      },
      update: {},
      create: {
        tenantId: companyId,
        supervisorUserId: supervisor.id,
        siteId,
      },
    });
  }

  return {
    sites: preview.normalized.Sites.length,
    drivers: preview.normalized.Drivers.length,
    vehicles: preview.normalized.Vehicles_Cards.length,
    fuel_cards: preview.normalized.Vehicles_Cards.filter((row) => row.cardNumber).length,
    tanks: preview.normalized.Tanks.length,
    equipment: preview.normalized.Equipment.length,
    credentials: preview.normalized.Driver_Compliance.length,
    supervisor_sites: preview.normalized.Supervisor_Sites.length,
  };
}
