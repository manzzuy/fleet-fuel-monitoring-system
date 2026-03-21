'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ChecklistMasterResponse } from '@fleet-fuel/shared';

import {
  ApiClientError,
  createDriverDailyCheck,
  getDriverDashboard,
  getDriverVehicles,
  getDriverChecklistMaster,
  submitDriverDailyCheck,
  uploadDriverReceipt,
} from '../lib/api';
import {
  getOdometerInputPlaceholder,
  getPreviousOdometerKm,
  validateOdometerAgainstPrevious,
} from '../lib/odometer-workflow';
import { driverTokenKey, isForcePasswordChangeToken } from '../lib/session';
import { DriverShell } from './driver-shell';
import { PaperChecklistRenderer } from '../../../packages/shared/ui/paper-checklist-renderer';

interface DriverDailyCheckProps {
  host: string | null;
  subdomain: string | null;
}

type ApiStatus = 'OK' | 'NOT_OK' | 'NA';
type UiStatus = 'PASS' | 'ISSUE' | null;
type VehicleOption = {
  id: string;
  fleet_no: string;
  plate_no: string | null;
  previous_odometer_km?: number | null;
};
type ChecklistItem = ChecklistMasterResponse['sections'][number]['items'][number];

const GROUP_ORDER = [
  'Mechanical & Exterior',
  'Fluids & Electrical',
  'Safety & Emergency',
  'Operational Controls',
  'Documentation & Tools',
] as const;
type GroupName = (typeof GROUP_ORDER)[number];

interface PaperTemplateItem {
  key: string;
  labelEn: string;
  labelAr: string;
  icon: string;
  aliases: string[];
}

interface PaperRowCellSpec {
  key: string;
  group: GroupName;
}

interface PaperRowSpec {
  cells: PaperRowCellSpec[];
}

const PAPER_TEMPLATE: Record<GroupName, PaperTemplateItem[]> = {
  'Mechanical & Exterior': [
    { key: 'body', labelEn: 'Body', labelAr: 'الهيكل', icon: '/checklist-icons/body.svg', aliases: ['body'] },
    { key: 'steering', labelEn: 'Steering', labelAr: 'الدركسون', icon: '/checklist-icons/steering.svg', aliases: ['steering'] },
    { key: 'mirrors', labelEn: 'Mirrors', labelAr: 'المرايا', icon: '/checklist-icons/mirrors.svg', aliases: ['mirror'] },
    {
      key: 'wipers',
      labelEn: 'Wipers / Windscreen',
      labelAr: 'المساحات / الزجاج',
      icon: '/checklist-icons/wipers-windscreen.svg',
      aliases: ['wiper', 'windscreen', 'windshield'],
    },
    {
      key: 'indicators',
      labelEn: 'Light / Indicators',
      labelAr: 'الأنوار / الإشارات',
      icon: '/checklist-icons/indicators.svg',
      aliases: ['indicator', 'light'],
    },
    {
      key: 'tyres',
      labelEn: 'Tyres / Wheel Condition',
      labelAr: 'الإطارات / العجلات',
      icon: '/checklist-icons/tyres-wheel-fixing.svg',
      aliases: ['tyre', 'tire', 'wheel'],
    },
    {
      key: 'load',
      labelEn: 'Load Restraint',
      labelAr: 'تثبيت الحمولة',
      icon: '/checklist-icons/load-restraint.svg',
      aliases: ['load', 'restrain'],
    },
    {
      key: 'reverse',
      labelEn: 'Reverse Alarm / Lights',
      labelAr: 'إنذار / إضاءة الرجوع',
      icon: '/checklist-icons/reverse-alarm.svg',
      aliases: ['reverse', 'alarm'],
    },
  ],
  'Fluids & Electrical': [
    { key: 'battery', labelEn: 'Battery', labelAr: 'البطارية', icon: '/checklist-icons/battery.svg', aliases: ['battery'] },
    { key: 'oil', labelEn: 'Oil (Level)', labelAr: 'مستوى الزيت', icon: '/checklist-icons/oil.svg', aliases: ['oil'] },
    { key: 'water', labelEn: 'Water (Level)', labelAr: 'مستوى الماء', icon: '/checklist-icons/water-level.svg', aliases: ['water', 'coolant'] },
    { key: 'fuel', labelEn: 'Fuel', labelAr: 'الوقود', icon: '/checklist-icons/fuel.svg', aliases: ['fuel'] },
    {
      key: 'fuse',
      labelEn: 'First Aid Box / Fuse Box',
      labelAr: 'صندوق الإسعافات / الفيوز',
      icon: '/checklist-icons/tools.svg',
      aliases: ['fuse box', 'fuse', 'electrical box'],
    },
  ],
  'Safety & Emergency': [
    {
      key: 'first-aid',
      labelEn: 'First Aid Box',
      labelAr: 'الإسعافات الأولية',
      icon: '/checklist-icons/first-aid-box.svg',
      aliases: ['first aid', 'aid'],
    },
    {
      key: 'extinguisher',
      labelEn: 'Fire Extinguisher',
      labelAr: 'طفاية الحريق',
      icon: '/checklist-icons/fire-extinguisher.svg',
      aliases: ['extinguisher'],
    },
    { key: 'seatbelt', labelEn: 'Seat Belt', labelAr: 'حزام الأمان', icon: '/checklist-icons/seat-belt.svg', aliases: ['seat belt', 'seatbelt'] },
    { key: 'horn', labelEn: 'Horn', labelAr: 'البوري', icon: '/checklist-icons/horn.svg', aliases: ['horn'] },
    { key: 'brakes', labelEn: 'Brakes', labelAr: 'الفرامل', icon: '/checklist-icons/brakes.svg', aliases: ['brake'] },
  ],
  'Operational Controls': [
    { key: 'speed', labelEn: 'Speed Limit Status', labelAr: 'حالة محدد السرعة', icon: '/checklist-icons/speed-limiter.svg', aliases: ['speed limit', 'speed'] },
    { key: 'measure', labelEn: 'Measuring Devices', labelAr: 'أجهزة القياس', icon: '/checklist-icons/measuring-devices.svg', aliases: ['measure'] },
    { key: 'tyre-pressure', labelEn: 'Tyre Pressure', labelAr: 'ضغط الإطارات', icon: '/checklist-icons/tyre-pressure.svg', aliases: ['tyre pressure', 'tire pressure'] },
    {
      key: 'high-flag',
      labelEn: 'High Flag Visibility',
      labelAr: 'وضوح العلم العالي',
      icon: '/checklist-icons/high-flag.svg',
      aliases: ['high flag', 'flag visibility'],
    },
    {
      key: 'plate-visible',
      labelEn: 'Vehicle Plate Visibility',
      labelAr: 'وضوح لوحة المركبة',
      icon: '/checklist-icons/plate-visible.svg',
      aliases: ['plate visibility', 'plate number', 'vehicle plate'],
    },
    {
      key: 'radio',
      labelEn: 'Radio Tape Recorder',
      labelAr: 'المسجل / الراديو',
      icon: '/checklist-icons/radio.svg',
      aliases: ['radio', 'tape recorder'],
    },
    {
      key: 'controls',
      labelEn: 'Operational Controls',
      labelAr: 'ضوابط التشغيل',
      icon: '/checklist-icons/radio.svg',
      aliases: ['control'],
    },
  ],
  'Documentation & Tools': [
    {
      key: 'registration',
      labelEn: 'Vehicle Registration Paper Status',
      labelAr: 'حالة أوراق التسجيل',
      icon: '/checklist-icons/vehicle-registration-paper.svg',
      aliases: ['registration', 'registration paper'],
    },
    { key: 'toolbox', labelEn: 'Toolbox', labelAr: 'صندوق الأدوات', icon: '/checklist-icons/tools.svg', aliases: ['toolbox'] },
    { key: 'tools', labelEn: 'Tools', labelAr: 'الأدوات', icon: '/checklist-icons/tools.svg', aliases: ['tool'] },
    { key: 'jack', labelEn: 'Jack Spanner', labelAr: 'الرافعة', icon: '/checklist-icons/jack.svg', aliases: ['jack', 'spanner'] },
    { key: 'ras', labelEn: 'RAS Sticker', labelAr: 'ملصق RAS', icon: '/checklist-icons/ras-sticker.svg', aliases: ['ras'] },
    {
      key: 'lock',
      labelEn: 'Safety Lock & Fittings',
      labelAr: 'قفل وتجهيزات الأمان',
      icon: '/checklist-icons/safety-lock-fittings.svg',
      aliases: ['lock', 'fitting'],
    },
    {
      key: 'aircon',
      labelEn: 'Air Conditioner',
      labelAr: 'مكيف الهواء',
      icon: '/checklist-icons/air-conditioner.svg',
      aliases: ['air conditioner', 'a/c', 'ac'],
    },
  ],
};

const PAPER_ROW_LAYOUT: PaperRowSpec[] = [
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'body' },
      { group: 'Fluids & Electrical', key: 'battery' },
      { group: 'Safety & Emergency', key: 'first-aid' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'steering' },
      { group: 'Fluids & Electrical', key: 'oil' },
      { group: 'Safety & Emergency', key: 'extinguisher' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'wipers' },
      { group: 'Fluids & Electrical', key: 'water' },
      { group: 'Documentation & Tools', key: 'tools' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'indicators' },
      { group: 'Safety & Emergency', key: 'horn' },
      { group: 'Documentation & Tools', key: 'jack' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'tyres' },
      { group: 'Fluids & Electrical', key: 'fuel' },
      { group: 'Safety & Emergency', key: 'brakes' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'mirrors' },
      { group: 'Safety & Emergency', key: 'seatbelt' },
      { group: 'Operational Controls', key: 'radio' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'load' },
      { group: 'Documentation & Tools', key: 'registration' },
      { group: 'Documentation & Tools', key: 'ras' },
    ],
  },
  {
    cells: [
      { group: 'Mechanical & Exterior', key: 'reverse' },
      { group: 'Operational Controls', key: 'speed' },
      { group: 'Documentation & Tools', key: 'aircon' },
    ],
  },
  {
    cells: [
      { group: 'Documentation & Tools', key: 'lock' },
      { group: 'Operational Controls', key: 'measure' },
      { group: 'Operational Controls', key: 'tyre-pressure' },
      { group: 'Operational Controls', key: 'high-flag' },
      { group: 'Operational Controls', key: 'plate-visible' },
    ],
  },
];

function templateUiKey(group: GroupName, key: string) {
  return `${group}:${key}`;
}

interface UiChecklistItem {
  uiKey: string;
  labelEn: string;
  labelAr: string;
  icon: string;
  group: GroupName;
  configured: boolean;
  required: boolean;
  apiItemCode?: string;
}

interface UiItemState {
  status: UiStatus;
  notes: string;
  photoName: string;
  severity: 'low' | 'high';
}

const defaultItemState: UiItemState = { status: null, notes: '', photoName: '', severity: 'low' };

function draftStorageKey(subdomain: string) {
  return `fleetfuel.driver.daily-check.draft.${subdomain}`;
}

interface DailyChecklistDraftV2 {
  version: 2;
  savedAt: string;
  selectedVehicleId: string;
  itemState: Record<string, UiItemState>;
}

interface DailyChecklistDraftV3 {
  version: 3;
  savedAt: string;
  selectedVehicleId: string;
  itemState: Record<string, UiItemState>;
  generalComment: string;
}

interface DailyChecklistDraftV4 {
  version: 4;
  savedAt: string;
  selectedVehicleId: string;
  itemState: Record<string, UiItemState>;
  generalComment: string;
  odometerKm: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isUiItemState(value: unknown): value is UiItemState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.status === 'PASS' || value.status === 'ISSUE' || value.status === null) &&
    typeof value.notes === 'string' &&
    typeof value.photoName === 'string' &&
    (value.severity === 'low' || value.severity === 'high' || typeof value.severity === 'undefined')
  );
}

function parseLegacyDraft(value: unknown): Record<string, UiItemState> {
  if (!isRecord(value)) {
    return {};
  }
  const entries = Object.entries(value).filter((entry): entry is [string, UiItemState] => isUiItemState(entry[1]));
  return Object.fromEntries(
    entries.map(([key, state]) => [key, { ...defaultItemState, ...state } satisfies UiItemState]),
  );
}

function parseDraftV2(value: unknown): DailyChecklistDraftV2 | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.version !== 2 || !isRecord(value.itemState) || typeof value.selectedVehicleId !== 'string') {
    return null;
  }
  return {
    version: 2,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    selectedVehicleId: value.selectedVehicleId,
    itemState: parseLegacyDraft(value.itemState),
  };
}

function parseDraftV3(value: unknown): DailyChecklistDraftV3 | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.version !== 3 ||
    !isRecord(value.itemState) ||
    typeof value.selectedVehicleId !== 'string' ||
    typeof value.generalComment !== 'string'
  ) {
    return null;
  }
  return {
    version: 3,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    selectedVehicleId: value.selectedVehicleId,
    itemState: parseLegacyDraft(value.itemState),
    generalComment: value.generalComment,
  };
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toApiStatus(status: UiStatus): ApiStatus {
  return status === 'ISSUE' ? 'NOT_OK' : status === 'PASS' ? 'OK' : 'NA';
}

function parseDraftV4(value: unknown): DailyChecklistDraftV4 | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    value.version !== 4 ||
    !isRecord(value.itemState) ||
    typeof value.selectedVehicleId !== 'string' ||
    typeof value.generalComment !== 'string' ||
    typeof value.odometerKm !== 'string'
  ) {
    return null;
  }
  return {
    version: 4,
    savedAt: typeof value.savedAt === 'string' ? value.savedAt : '',
    selectedVehicleId: value.selectedVehicleId,
    itemState: parseLegacyDraft(value.itemState),
    generalComment: value.generalComment,
    odometerKm: value.odometerKm,
  };
}

function hasDraftContent(
  itemState: Record<string, UiItemState>,
  selectedVehicleId: string,
  generalComment: string,
  odometerKm: string,
) {
  if (selectedVehicleId) {
    return true;
  }
  if (generalComment.trim()) {
    return true;
  }
  if (odometerKm.trim()) {
    return true;
  }
  return Object.values(itemState).some((state) => Boolean(state.status || state.notes.trim() || state.photoName));
}

export function DriverDailyCheck({ host, subdomain }: DriverDailyCheckProps) {
  const router = useRouter();
  const [master, setMaster] = useState<ChecklistMasterResponse | null>(null);
  const [itemState, setItemState] = useState<Record<string, UiItemState>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('Driver');
  const [assignedVehicleLabel, setAssignedVehicleLabel] = useState<string>('Not assigned');
  const [assignedSiteLabel, setAssignedSiteLabel] = useState<string>('Not assigned');
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, File>>({});
  const [generalComment, setGeneralComment] = useState<string>('');
  const [odometerKm, setOdometerKm] = useState<string>('');
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const odometerInputRef = useRef<HTMLInputElement | null>(null);

  async function loadChecklist(activeHost: string, activeSubdomain: string) {
    const token = window.localStorage.getItem(driverTokenKey(activeSubdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    if (isForcePasswordChangeToken(token)) {
      router.replace('/change-password');
      return;
    }

    setLoading(true);
    setError(null);
    setSubmitError(null);

    try {
      const [result, driverVehicles, dashboard] = await Promise.all([
        getDriverChecklistMaster(activeHost, token),
        getDriverVehicles(activeHost, token),
        getDriverDashboard(activeHost, token),
      ]);
      setMaster(result);
      setVehicles(driverVehicles.items);
      setDriverName(dashboard.driver.full_name);
      setAssignedSiteLabel(
        dashboard.assignment.site ? `${dashboard.assignment.site.site_code} - ${dashboard.assignment.site.site_name}` : 'Not assigned',
      );
      setAssignedVehicleLabel(
        dashboard.assignment.vehicle
          ? `${dashboard.assignment.vehicle.fleet_no}${dashboard.assignment.vehicle.plate_no ? ` (${dashboard.assignment.vehicle.plate_no})` : ''}`
          : 'Not assigned',
      );

      const draft = window.localStorage.getItem(draftStorageKey(activeSubdomain));
      if (draft) {
        try {
          const parsed = JSON.parse(draft) as unknown;
          const draftV4 = parseDraftV4(parsed);
          const draftV3 = draftV4 ? null : parseDraftV3(parsed);
          const draftV2 = draftV3 ? null : parseDraftV2(parsed);
          let restored = false;
          if (draftV4 && hasDraftContent(draftV4.itemState, draftV4.selectedVehicleId, draftV4.generalComment, draftV4.odometerKm)) {
            setItemState(draftV4.itemState);
            setGeneralComment(draftV4.generalComment);
            setOdometerKm(draftV4.odometerKm);
            if (draftV4.selectedVehicleId) {
              setSelectedVehicleId(draftV4.selectedVehicleId);
            } else {
              const preferredVehicleId = dashboard.assignment.vehicle?.id ?? driverVehicles.items[0]?.id ?? '';
              setSelectedVehicleId(preferredVehicleId);
            }
            restored = true;
          } else if (draftV3 && hasDraftContent(draftV3.itemState, draftV3.selectedVehicleId, draftV3.generalComment, '')) {
            setItemState(draftV3.itemState);
            setGeneralComment(draftV3.generalComment);
            if (draftV3.selectedVehicleId) {
              setSelectedVehicleId(draftV3.selectedVehicleId);
            } else {
              const preferredVehicleId = dashboard.assignment.vehicle?.id ?? driverVehicles.items[0]?.id ?? '';
              setSelectedVehicleId(preferredVehicleId);
            }
            restored = true;
          } else if (draftV2 && hasDraftContent(draftV2.itemState, draftV2.selectedVehicleId, '', '')) {
            setItemState(draftV2.itemState);
            if (draftV2.selectedVehicleId) {
              setSelectedVehicleId(draftV2.selectedVehicleId);
            } else {
              const preferredVehicleId = dashboard.assignment.vehicle?.id ?? driverVehicles.items[0]?.id ?? '';
              setSelectedVehicleId(preferredVehicleId);
            }
            restored = true;
          } else {
            const legacy = parseLegacyDraft(parsed);
            setItemState(legacy);
            const preferredVehicleId = dashboard.assignment.vehicle?.id ?? driverVehicles.items[0]?.id ?? '';
            setSelectedVehicleId(preferredVehicleId);
            if (hasDraftContent(legacy, preferredVehicleId, '', '')) {
              restored = true;
            }
          }
          setRestoredDraft(restored);
        } catch {
          window.localStorage.removeItem(draftStorageKey(activeSubdomain));
        }
      } else {
        const preferredVehicleId = dashboard.assignment.vehicle?.id ?? driverVehicles.items[0]?.id ?? '';
        setSelectedVehicleId(preferredVehicleId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!host || !subdomain) {
      router.replace('/');
      return;
    }

    void loadChecklist(host, subdomain).catch((caught) => {
      if (caught instanceof ApiClientError) {
        setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to load checklist.');
      }
    });
  }, [host, router, subdomain]);

  const uiItemsByGroup = useMemo(() => {
    const masterItems = (master?.sections ?? []).flatMap((section) => section.items);
    const remaining = [...masterItems];

    const grouped = Object.fromEntries(GROUP_ORDER.map((group) => [group, [] as UiChecklistItem[]])) as Record<
      GroupName,
      UiChecklistItem[]
    >;

    for (const group of GROUP_ORDER) {
      for (const templateItem of PAPER_TEMPLATE[group]) {
        const matchedIndex = remaining.findIndex((item) => {
          const itemName = normalize(item.item_name);
          return templateItem.aliases.some((alias) => itemName.includes(normalize(alias)));
        });
        const matched = matchedIndex >= 0 ? remaining.splice(matchedIndex, 1)[0] : null;
        grouped[group].push({
          uiKey: `${group}:${templateItem.key}`,
          labelEn: templateItem.labelEn,
          labelAr: templateItem.labelAr,
          icon: templateItem.icon,
          group,
          configured: Boolean(matched),
          required: Boolean(matched?.required),
          ...(matched?.item_code ? { apiItemCode: matched.item_code } : {}),
        });
      }
    }

    // Any configured checklist items not matched by aliases are placed in Documentation & Tools.
    for (const item of remaining) {
      grouped['Documentation & Tools'].push({
        uiKey: `extra:${item.item_code}`,
        labelEn: item.item_name,
        labelAr: 'عنصر إضافي',
        icon: '/checklist-icons/tools.svg',
        group: 'Documentation & Tools',
        configured: true,
        required: item.required,
        apiItemCode: item.item_code,
      });
    }

    return grouped;
  }, [master]);

  const allUiItems = useMemo(() => GROUP_ORDER.flatMap((group) => uiItemsByGroup[group]), [uiItemsByGroup]);
  const uiItemByKey = useMemo(() => {
    const map = new Map<string, UiChecklistItem>();
    for (const item of allUiItems) {
      map.set(item.uiKey, item);
    }
    return map;
  }, [allUiItems]);
  const paperRows = useMemo(
    () =>
      PAPER_ROW_LAYOUT.map((row) => ({
        cells: row.cells.flatMap((cell) => {
          const lookupKey = templateUiKey(cell.group, cell.key);
          const item = uiItemByKey.get(lookupKey);
          if (!item?.configured) {
            return [];
          }
          return [{ uiKey: lookupKey, item }];
        }),
      })).filter((row) => row.cells.length > 0),
    [uiItemByKey],
  );
  const visibleChecklistItems = useMemo(
    () => paperRows.flatMap((row) => row.cells.map((cell) => cell.item)),
    [paperRows],
  );
  const configuredItems = useMemo(
    () => visibleChecklistItems.filter((item) => item.configured && item.apiItemCode),
    [visibleChecklistItems],
  );
  const requiredConfiguredItems = useMemo(() => configuredItems.filter((item) => item.required), [configuredItems]);
  const answeredConfiguredItems = useMemo(
    () => configuredItems.filter((item) => Boolean((itemState[item.uiKey] ?? defaultItemState).status)),
    [configuredItems, itemState],
  );
  const issueCount = useMemo(
    () => configuredItems.filter((item) => (itemState[item.uiKey] ?? defaultItemState).status === 'ISSUE').length,
    [configuredItems, itemState],
  );

  const requiredCompleted = useMemo(
    () =>
      requiredConfiguredItems.filter((item) => {
        const state = itemState[item.uiKey] ?? defaultItemState;
        return Boolean(state.status);
      }).length,
    [itemState, requiredConfiguredItems],
  );
  const remainingRequiredCount = Math.max(0, requiredConfiguredItems.length - requiredCompleted);
  const progressPct = configuredItems.length > 0 ? Math.round((answeredConfiguredItems.length / configuredItems.length) * 100) : 0;
  const markAllOkChecked = useMemo(
    () =>
      configuredItems.length > 0 &&
      configuredItems.every((item) => (itemState[item.uiKey] ?? defaultItemState).status === 'PASS'),
    [configuredItems, itemState],
  );
  const previousOdometerKm = useMemo(
    () => getPreviousOdometerKm(vehicles, selectedVehicleId),
    [selectedVehicleId, vehicles],
  );
  const odometerValidationMessage = useMemo(() => {
    if (!odometerKm.trim()) {
      return null;
    }
    return validateOdometerAgainstPrevious(odometerKm, previousOdometerKm);
  }, [odometerKm, previousOdometerKm]);

  function signOut() {
    if (subdomain) {
      window.localStorage.removeItem(driverTokenKey(subdomain));
    }
    router.replace('/');
  }

  function saveDraft(next: Record<string, UiItemState>) {
    setItemState(next);
  }

  function setStatus(uiKey: string, status: UiStatus) {
    const current = itemState[uiKey] ?? defaultItemState;
    const nextUnansweredConfiguredItem = status === 'PASS'
      ? configuredItems.find((item) => item.uiKey !== uiKey && !(itemState[item.uiKey] ?? defaultItemState).status)
      : null;
    const next = {
      ...itemState,
      [uiKey]: {
        ...current,
        status,
      },
    };
    saveDraft(next);

    if (status === 'PASS' && nextUnansweredConfiguredItem) {
      requestAnimationFrame(() => {
        const nextElement = cardRefs.current[nextUnansweredConfiguredItem.uiKey];
        nextElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function setNotes(uiKey: string, notes: string) {
    const current = itemState[uiKey] ?? defaultItemState;
    const next = {
      ...itemState,
      [uiKey]: {
        ...current,
        notes,
      },
    };
    saveDraft(next);
  }

  function setPhoto(uiKey: string, photoName: string) {
    const current = itemState[uiKey] ?? defaultItemState;
    const next = {
      ...itemState,
      [uiKey]: {
        ...current,
        photoName,
      },
    };
    saveDraft(next);
  }

  function setSeverity(uiKey: string, severity: 'low' | 'high') {
    const current = itemState[uiKey] ?? defaultItemState;
    const next = {
      ...itemState,
      [uiKey]: {
        ...current,
        severity,
      },
    };
    saveDraft(next);
  }

  function toggleMarkAllOk(checked: boolean) {
    const next = { ...itemState };
    for (const item of configuredItems) {
      const current = next[item.uiKey] ?? defaultItemState;
      next[item.uiKey] = {
        ...current,
        status: checked ? 'PASS' : null,
      };
    }
    saveDraft(next);
  }

  useEffect(() => {
    if (!subdomain || loading) {
      return;
    }
    if (!hasDraftContent(itemState, selectedVehicleId, generalComment, odometerKm)) {
      window.localStorage.removeItem(draftStorageKey(subdomain));
      return;
    }
    const payload: DailyChecklistDraftV4 = {
      version: 4,
      savedAt: new Date().toISOString(),
      selectedVehicleId,
      itemState,
      generalComment,
      odometerKm,
    };
    window.localStorage.setItem(draftStorageKey(subdomain), JSON.stringify(payload));
  }, [generalComment, itemState, loading, odometerKm, selectedVehicleId, subdomain]);

  async function onSubmit() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }
    if (isForcePasswordChangeToken(token)) {
      router.replace('/change-password');
      return;
    }

    const missingRequired = requiredConfiguredItems.filter((item) => !(itemState[item.uiKey] ?? defaultItemState).status);
    if (missingRequired.length > 0) {
      setSubmitError('Complete all required checklist items before submit.');
      return;
    }
    const odometerError = validateOdometerAgainstPrevious(odometerKm, previousOdometerKm);
    if (odometerError) {
      setSubmitError(odometerError);
      return;
    }

    const payloadItems: Array<{ item_code: string; status: ApiStatus; notes?: string; photo_url?: string }> = [];

    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);

    try {
      for (const item of configuredItems) {
        const state = itemState[item.uiKey] ?? defaultItemState;
        if (!state.status || !item.apiItemCode) {
          continue;
        }
        let photoUrl: string | undefined;
        const pendingPhoto = pendingPhotos[item.uiKey];
        if (state.status === 'ISSUE' && pendingPhoto) {
          const uploaded = await uploadDriverReceipt(host, token, pendingPhoto);
          photoUrl = uploaded.receipt_url;
        }
        payloadItems.push({
          item_code: item.apiItemCode,
          status: toApiStatus(state.status),
          ...(state.notes ? { notes: state.notes.trim() } : {}),
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        });
      }

      const date = new Date().toISOString().slice(0, 10);
      const check = await createDriverDailyCheck(host, token, {
        check_date: date,
        ...(selectedVehicleId ? { vehicle_id: selectedVehicleId } : {}),
        odometer_km: Number(odometerKm),
        odometer_fallback_used: false,
      });
      await submitDriverDailyCheck(host, token, check.id, { items: payloadItems });
      const refreshedVehicles = await getDriverVehicles(host, token);
      setVehicles(refreshedVehicles.items);
      setSuccess('Daily checklist submitted.');
      if (subdomain) {
        window.localStorage.removeItem(draftStorageKey(subdomain));
      }
      setItemState({});
      setGeneralComment('');
      setOdometerKm('');
      setPendingPhotos({});
      setRestoredDraft(false);
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setSubmitError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
      } else {
        setSubmitError(caught instanceof Error ? caught.message : 'Checklist submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DriverShell
      compactTop
      onSignOut={signOut}
      subdomain={subdomain ?? 'tenant'}
      subtitle="Complete checklist items before starting operations."
      title="Daily checklist"
    >
      <section className="panel">
        {loading ? <p className="status">Loading checklist...</p> : null}
        {error ? (
          <div className="stack">
            <p className="status error">{error}</p>
            <button
              className="button ghost"
              onClick={() => {
                if (host && subdomain) {
                  void loadChecklist(host, subdomain).catch((caught) => {
                    if (caught instanceof ApiClientError) {
                      setError(`${caught.message}${caught.requestId ? ` (request_id: ${caught.requestId})` : ''}`);
                    } else {
                      setError(caught instanceof Error ? caught.message : 'Unable to load checklist.');
                    }
                  });
                }
              }}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : null}

        {success ? (
          <p className="status success" data-testid="driver-checklist-submit-success">
            {success}
          </p>
        ) : null}

        {!loading && !error && master ? (
          <div className="stack" data-testid="driver-checklist-form">
            {submitError ? <p className="status error">{submitError}</p> : null}

            <div className="checklist-compact-header" data-testid="driver-checklist-progress-header">
              <button className="checklist-back-link" onClick={() => router.push('/dashboard')} type="button">
                ← Daily Inspection
              </button>
              <div className="checklist-compact-meta">
                <span><strong>Driver:</strong> {driverName}</span>
                <span><strong>Vehicle:</strong> {assignedVehicleLabel}</span>
                <span><strong>Site:</strong> {assignedSiteLabel}</span>
                <span><strong>Date:</strong> {new Date().toLocaleDateString()}</span>
              </div>
              <div className="checklist-sticky-progress-head">
                <span>{answeredConfiguredItems.length} / {configuredItems.length} completed</span>
              </div>
              <div className="checklist-sticky-progress-meta">
                <span>Issues: {issueCount}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="checklist-progress-bar" aria-hidden="true">
                <span style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            {restoredDraft ? (
              <p className="status checklist-thin-banner" data-testid="driver-checklist-draft-restored">
                Draft restored.
              </p>
            ) : null}

            <div className="checklist-progress">
              <strong>{requiredCompleted}</strong> / {requiredConfiguredItems.length} required completed
            </div>

            <label className="checkbox checklist-mark-all-ok" data-testid="driver-checklist-mark-all-ok-row">
              <input
                checked={markAllOkChecked}
                data-testid="driver-checklist-mark-all-ok"
                disabled={configuredItems.length === 0}
                onChange={(event) => toggleMarkAllOk(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Mark all items OK</strong>
                <small className="status checklist-mark-all-ok-helper">Tap any item to report issue</small>
              </span>
            </label>

            <div className="vehicle-odometer-row" data-testid="driver-checklist-vehicle-odometer-row">
              <label className="field">
                <span>Vehicle</span>
                <select
                  data-testid="driver-checklist-vehicle"
                  onChange={(event) => {
                    setSelectedVehicleId(event.target.value);
                    requestAnimationFrame(() => odometerInputRef.current?.focus());
                  }}
                  value={selectedVehicleId}
                >
                  {vehicles.length === 0 ? <option value="">No vehicles available</option> : null}
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                    </option>
                  ))}
                </select>
              </label>
            <label className="field">
                <span>Odometer (km)</span>
              <div className="odometer-input-wrap">
                <input
                  data-testid="driver-checklist-odometer"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => setOdometerKm(event.target.value)}
                  placeholder={getOdometerInputPlaceholder(previousOdometerKm)}
                  ref={odometerInputRef}
                  required
                  type="number"
                  value={odometerKm}
                />
              </div>
                {odometerValidationMessage ? (
                  <small className="status error" data-testid="driver-checklist-odometer-warning">
                    {odometerValidationMessage}
                  </small>
                ) : null}
              </label>
            </div>

            <PaperChecklistRenderer
              cardRef={(uiKey, element) => {
                cardRefs.current[uiKey] = element;
              }}
              mode="driver"
              onPickStatus={setStatus}
              renderIssueDetails={(uiKey) => (
                <div className="inline-defect-fields">
                  <label className="field">
                    <span>Issue note (optional)</span>
                    <input
                      data-testid={`driver-checklist-issue-note-${uiKey}`}
                      onChange={(event) => setNotes(uiKey, event.target.value)}
                      placeholder="Short issue note"
                      type="text"
                      value={(itemState[uiKey] ?? defaultItemState).notes}
                    />
                  </label>
                  <label className="field">
                    <span>Severity (optional)</span>
                    <select
                      data-testid={`driver-checklist-issue-severity-${uiKey}`}
                      onChange={(event) => setSeverity(uiKey, event.target.value === 'high' ? 'high' : 'low')}
                      value={(itemState[uiKey] ?? defaultItemState).severity}
                    >
                      <option value="low">Monitor</option>
                      <option value="high">Critical</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Issue photo (optional)</span>
                    <input
                      accept="image/*"
                      capture="environment"
                      data-testid={`driver-checklist-issue-photo-${uiKey}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          setPendingPhotos((currentPhotos) => ({ ...currentPhotos, [uiKey]: file }));
                          setPhoto(uiKey, file.name);
                        }
                      }}
                      type="file"
                    />
                  </label>
                  {(itemState[uiKey] ?? defaultItemState).photoName ? (
                    <p className="status">📷 {(itemState[uiKey] ?? defaultItemState).photoName}</p>
                  ) : null}
                </div>
              )}
              rows={paperRows}
              statuses={Object.fromEntries(
                visibleChecklistItems.map((item) => [item.uiKey, (itemState[item.uiKey] ?? defaultItemState).status]),
              )}
              testIdPrefix="driver-checklist"
            />

            <label className="field checklist-general-comment">
              <span>General comment (optional)</span>
              <textarea
                className="checklist-comment-input"
                data-testid="driver-checklist-general-comment"
                onChange={(event) => setGeneralComment(event.target.value)}
                placeholder="Additional note..."
                rows={3}
                value={generalComment}
              />
            </label>

            <div className="checklist-sticky-submit" data-testid="driver-checklist-sticky-submit">
              <div className="checklist-sticky-submit-meta">
                <strong>{answeredConfiguredItems.length} completed</strong>
                <span>{issueCount} issues</span>
                {remainingRequiredCount > 0 ? <span>{remainingRequiredCount} checks remaining</span> : null}
              </div>
              <button
                className="button"
                data-testid="driver-submit-daily-checklist"
                disabled={submitting || remainingRequiredCount > 0 || !odometerKm.trim() || Boolean(odometerValidationMessage)}
                onClick={onSubmit}
                type="button"
              >
                {submitting ? 'Submitting...' : 'Submit inspection'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </DriverShell>
  );
}
