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
import { driverTokenKey } from '../lib/session';
import { DriverShell } from './driver-shell';

interface DriverDailyCheckProps {
  host: string | null;
  subdomain: string | null;
}

type ApiStatus = 'OK' | 'NOT_OK' | 'NA';
type UiStatus = 'PASS' | 'ISSUE' | null;
type VehicleOption = { id: string; fleet_no: string; plate_no: string | null };
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
  placeholder?: boolean;
}

interface PaperRowSpec {
  cells: PaperRowCellSpec[];
}

const PAPER_TEMPLATE: Record<GroupName, PaperTemplateItem[]> = {
  'Mechanical & Exterior': [
    { key: 'body', labelEn: 'Body', labelAr: 'الهيكل', icon: '🚛', aliases: ['body'] },
    { key: 'steering', labelEn: 'Steering', labelAr: 'الدركسون', icon: '🛞', aliases: ['steering'] },
    { key: 'mirrors', labelEn: 'Mirrors', labelAr: 'المرايا', icon: '🪞', aliases: ['mirror'] },
    {
      key: 'wipers',
      labelEn: 'Wipers / Windscreen',
      labelAr: 'المساحات / الزجاج',
      icon: '🪟',
      aliases: ['wiper', 'windscreen', 'windshield'],
    },
    {
      key: 'indicators',
      labelEn: 'Light / Indicators',
      labelAr: 'الأنوار / الإشارات',
      icon: '🚨',
      aliases: ['indicator', 'light'],
    },
    {
      key: 'tyres',
      labelEn: 'Tyres / Wheel Condition',
      labelAr: 'الإطارات / العجلات',
      icon: '🛞',
      aliases: ['tyre', 'tire', 'wheel'],
    },
    {
      key: 'load',
      labelEn: 'Load Restraint',
      labelAr: 'تثبيت الحمولة',
      icon: '📦',
      aliases: ['load', 'restrain'],
    },
    {
      key: 'reverse',
      labelEn: 'Reverse Alarm / Lights',
      labelAr: 'إنذار / إضاءة الرجوع',
      icon: '🔊',
      aliases: ['reverse', 'alarm'],
    },
  ],
  'Fluids & Electrical': [
    { key: 'battery', labelEn: 'Battery', labelAr: 'البطارية', icon: '🔋', aliases: ['battery'] },
    { key: 'oil', labelEn: 'Oil (Level)', labelAr: 'مستوى الزيت', icon: '🛢️', aliases: ['oil'] },
    { key: 'water', labelEn: 'Water (Level)', labelAr: 'مستوى الماء', icon: '💧', aliases: ['water', 'coolant'] },
    { key: 'fuel', labelEn: 'Fuel', labelAr: 'الوقود', icon: '⛽', aliases: ['fuel'] },
    {
      key: 'fuse',
      labelEn: 'First Aid Box / Fuse Box',
      labelAr: 'صندوق الإسعافات / الفيوز',
      icon: '🧰',
      aliases: ['fuse box', 'fuse', 'electrical box'],
    },
  ],
  'Safety & Emergency': [
    {
      key: 'first-aid',
      labelEn: 'First Aid Box',
      labelAr: 'الإسعافات الأولية',
      icon: '🩹',
      aliases: ['first aid', 'aid'],
    },
    {
      key: 'extinguisher',
      labelEn: 'Fire Extinguisher',
      labelAr: 'طفاية الحريق',
      icon: '🧯',
      aliases: ['extinguisher'],
    },
    { key: 'seatbelt', labelEn: 'Seat Belt', labelAr: 'حزام الأمان', icon: '🪑', aliases: ['seat belt', 'seatbelt'] },
    { key: 'horn', labelEn: 'Horn', labelAr: 'البوري', icon: '📯', aliases: ['horn'] },
    { key: 'brakes', labelEn: 'Brakes', labelAr: 'الفرامل', icon: '🛑', aliases: ['brake'] },
  ],
  'Operational Controls': [
    { key: 'speed', labelEn: 'Speed Limit Status', labelAr: 'حالة محدد السرعة', icon: '🏁', aliases: ['speed limit', 'speed'] },
    { key: 'measure', labelEn: 'Measuring Devices', labelAr: 'أجهزة القياس', icon: '📏', aliases: ['measure'] },
    { key: 'tyre-pressure', labelEn: 'Tyre Pressure', labelAr: 'ضغط الإطارات', icon: '🛞', aliases: ['tyre pressure', 'tire pressure'] },
    {
      key: 'high-flag',
      labelEn: 'High Flag Visibility',
      labelAr: 'وضوح العلم العالي',
      icon: '🚩',
      aliases: ['high flag', 'flag visibility'],
    },
    {
      key: 'plate-visible',
      labelEn: 'Vehicle Plate Visibility',
      labelAr: 'وضوح لوحة المركبة',
      icon: '🔢',
      aliases: ['plate visibility', 'plate number', 'vehicle plate'],
    },
    {
      key: 'radio',
      labelEn: 'Radio Tape Recorder',
      labelAr: 'المسجل / الراديو',
      icon: '📻',
      aliases: ['radio', 'tape recorder'],
    },
    {
      key: 'controls',
      labelEn: 'Operational Controls',
      labelAr: 'ضوابط التشغيل',
      icon: '🕹️',
      aliases: ['control'],
    },
  ],
  'Documentation & Tools': [
    {
      key: 'registration',
      labelEn: 'Vehicle Registration Paper Status',
      labelAr: 'حالة أوراق التسجيل',
      icon: '📄',
      aliases: ['registration', 'registration paper'],
    },
    { key: 'toolbox', labelEn: 'Toolbox', labelAr: 'صندوق الأدوات', icon: '🧰', aliases: ['toolbox'] },
    { key: 'tools', labelEn: 'Tools', labelAr: 'الأدوات', icon: '🛠️', aliases: ['tool'] },
    { key: 'jack', labelEn: 'Jack Spanner', labelAr: 'الرافعة', icon: '🔧', aliases: ['jack', 'spanner'] },
    { key: 'ras', labelEn: 'RAS Sticker', labelAr: 'ملصق RAS', icon: '🏷️', aliases: ['ras'] },
    {
      key: 'lock',
      labelEn: 'Safety Lock & Fittings',
      labelAr: 'قفل وتجهيزات الأمان',
      icon: '⛓️',
      aliases: ['lock', 'fitting'],
    },
    {
      key: 'aircon',
      labelEn: 'Air Conditioner',
      labelAr: 'مكيف الهواء',
      icon: '❄️',
      aliases: ['air conditioner', 'a/c', 'ac'],
    },
    { key: 'other', labelEn: 'Other', labelAr: 'أخرى', icon: '📌', aliases: ['other'] },
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
  {
    cells: [
      { group: 'Documentation & Tools', key: 'other' },
      { group: 'Documentation & Tools', key: 'other-2', placeholder: true },
      { group: 'Documentation & Tools', key: 'other-3', placeholder: true },
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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toApiStatus(status: UiStatus): ApiStatus {
  return status === 'ISSUE' ? 'NOT_OK' : status === 'PASS' ? 'OK' : 'NA';
}

function hasDraftContent(itemState: Record<string, UiItemState>, selectedVehicleId: string) {
  if (selectedVehicleId) {
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
  const [activeDefectKey, setActiveDefectKey] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  async function loadChecklist(activeHost: string, activeSubdomain: string) {
    const token = window.localStorage.getItem(driverTokenKey(activeSubdomain));
    if (!token) {
      router.replace('/');
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
          const draftV2 = parseDraftV2(parsed);
          let restored = false;
          if (draftV2 && hasDraftContent(draftV2.itemState, draftV2.selectedVehicleId)) {
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
            if (hasDraftContent(legacy, preferredVehicleId)) {
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
        icon: '📌',
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
        cells: row.cells.map((cell) => {
          if (cell.placeholder) {
            return {
              placeholder: true as const,
              uiKey: `${cell.group}:${cell.key}`,
              item: {
                uiKey: `${cell.group}:${cell.key}`,
                labelEn: 'Other',
                labelAr: 'أخرى',
                icon: '📌',
                group: cell.group,
                configured: false,
                required: false,
              } satisfies UiChecklistItem,
            };
          }
          const lookupKey = templateUiKey(cell.group, cell.key);
          const item = uiItemByKey.get(lookupKey);
          return {
            placeholder: false as const,
            uiKey: lookupKey,
            item:
              item ??
              ({
                uiKey: lookupKey,
                labelEn: cell.key,
                labelAr: 'عنصر',
                icon: '📌',
                group: cell.group,
                configured: false,
                required: false,
              } satisfies UiChecklistItem),
          };
        }),
      })),
    [uiItemByKey],
  );
  const configuredItems = useMemo(() => allUiItems.filter((item) => item.configured && item.apiItemCode), [allUiItems]);
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
        ...(status === 'PASS' ? { notes: '', photoName: '', severity: 'low' as const } : {}),
      },
    };
    if (status === 'PASS') {
      setPendingPhotos((currentPhotos) => {
        const nextPhotos = { ...currentPhotos };
        delete nextPhotos[uiKey];
        return nextPhotos;
      });
    }
    saveDraft(next);
    if (status === 'ISSUE') {
      setActiveDefectKey(uiKey);
    } else if (activeDefectKey === uiKey) {
      setActiveDefectKey(null);
    }

    if (status === 'PASS' && nextUnansweredConfiguredItem) {
      requestAnimationFrame(() => {
        const nextElement = cardRefs.current[nextUnansweredConfiguredItem.uiKey];
        nextElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function saveDefect(uiKey: string, notes: string, severity: 'low' | 'high', photoName: string) {
    const current = itemState[uiKey] ?? defaultItemState;
    const next = {
      ...itemState,
      [uiKey]: {
        ...current,
        status: 'ISSUE' as const,
        notes,
        severity,
        photoName,
      },
    };
    saveDraft(next);
    setActiveDefectKey(null);
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

  useEffect(() => {
    if (!subdomain || loading) {
      return;
    }
    if (!hasDraftContent(itemState, selectedVehicleId)) {
      window.localStorage.removeItem(draftStorageKey(subdomain));
      return;
    }
    const payload: DailyChecklistDraftV2 = {
      version: 2,
      savedAt: new Date().toISOString(),
      selectedVehicleId,
      itemState,
    };
    window.localStorage.setItem(draftStorageKey(subdomain), JSON.stringify(payload));
  }, [itemState, loading, selectedVehicleId, subdomain]);

  async function onSubmit() {
    if (!host || !subdomain) {
      return;
    }
    const token = window.localStorage.getItem(driverTokenKey(subdomain));
    if (!token) {
      router.replace('/');
      return;
    }

    const missingRequired = requiredConfiguredItems.filter((item) => !(itemState[item.uiKey] ?? defaultItemState).status);
    if (missingRequired.length > 0) {
      setSubmitError('Complete all required checklist items before submit.');
      return;
    }

    const issueWithoutNotes = configuredItems.find((item) => {
      const state = itemState[item.uiKey] ?? defaultItemState;
      return state.status === 'ISSUE' && !state.notes.trim();
    });
    if (issueWithoutNotes) {
      setSubmitError(`Add a short note for issue: ${issueWithoutNotes.labelEn}.`);
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
      });
      await submitDriverDailyCheck(host, token, check.id, { items: payloadItems });
      setSuccess('Daily checklist submitted.');
      if (subdomain) {
        window.localStorage.removeItem(draftStorageKey(subdomain));
      }
      setItemState({});
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

        {!loading && !error && restoredDraft ? (
          <p className="status" data-testid="driver-checklist-draft-restored">
            In-progress checklist restored.
          </p>
        ) : null}

        {!loading && !error && master ? (
          <p className="status">
            Required items: {requiredConfiguredItems.length} / Total items: {configuredItems.length}
          </p>
        ) : null}

        {!loading && !error && master ? (
          <div className="stack" data-testid="driver-checklist-form">
            {submitError ? <p className="status error">{submitError}</p> : null}

            <div className="checklist-sticky-progress" data-testid="driver-checklist-progress-header">
              <div className="checklist-sticky-progress-head">
                <strong>Daily Inspection</strong>
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

            <div className="checklist-context-grid">
              <div className="checklist-context-card">
                <span>Driver</span>
                <strong>{driverName}</strong>
              </div>
              <div className="checklist-context-card">
                <span>Assigned Vehicle</span>
                <strong>{assignedVehicleLabel}</strong>
              </div>
              <div className="checklist-context-card">
                <span>Assigned Site</span>
                <strong>{assignedSiteLabel}</strong>
              </div>
            </div>

            <div className="checklist-progress">
              <strong>{requiredCompleted}</strong> / {requiredConfiguredItems.length} required completed
            </div>

            <label className="field">
              <span>Vehicle</span>
              <select data-testid="driver-checklist-vehicle" onChange={(event) => setSelectedVehicleId(event.target.value)} value={selectedVehicleId}>
                {vehicles.length === 0 ? <option value="">No vehicles available</option> : null}
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.fleet_no} {vehicle.plate_no ? `(${vehicle.plate_no})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <section className="paper-form" data-testid="driver-checklist-paper-form">
              <div className="paper-header">
                <div className="paper-header-row">
                  <span>NAME: {driverName}</span>
                  <span>FLEET/REGN. NO: {assignedVehicleLabel}</span>
                </div>
                <div className="paper-header-row">
                  <span>C. NO.:</span>
                  <span>DATE: {new Date().toLocaleDateString()}</span>
                </div>
              </div>

              <div className="paper-grid">
                {paperRows.map((row, rowIndex) => (
                  <div
                    className={`paper-row ${row.cells.length === 5 ? 'paper-row-five' : 'paper-row-three'}`}
                    key={`paper-row-${rowIndex + 1}`}
                  >
                    {row.cells.map(({ item, uiKey, placeholder }) => {
                      const state = itemState[item.uiKey] ?? defaultItemState;
                      const isIssue = state.status === 'ISSUE';
                      return (
                        <article
                          className={`checklist-card paper-cell${item.configured ? '' : ' disabled'}${placeholder ? ' placeholder' : ''}`}
                          data-testid={`driver-checklist-item-${item.uiKey}`}
                          key={uiKey}
                          ref={(element) => {
                            cardRefs.current[item.uiKey] = element;
                          }}
                        >
                          <div className="checklist-item-label">
                            <span className="checklist-item-icon" aria-hidden="true">
                              {item.icon}
                            </span>
                            <p>
                              <span className="checklist-item-label-en">
                                {item.labelEn} {item.required ? <strong>(Required)</strong> : null}
                              </span>
                              <span className="checklist-item-label-ar">{item.labelAr}</span>
                            </p>
                          </div>

                          <div className="paper-check-controls">
                            <button
                              aria-label="PASS"
                              className={`paper-check pass ${state.status === 'PASS' ? 'active pass' : ''}`}
                              data-testid={`driver-checklist-pass-${item.uiKey}`}
                              disabled={!item.configured || placeholder}
                              onClick={() => setStatus(item.uiKey, 'PASS')}
                              type="button"
                            >
                              <span aria-hidden="true">✓</span>
                            </button>
                            <button
                              aria-label="ISSUE"
                              className={`paper-check issue ${isIssue ? 'active issue' : ''}`}
                              data-testid={`driver-checklist-issue-${item.uiKey}`}
                              disabled={!item.configured || placeholder}
                              onClick={() => setStatus(item.uiKey, 'ISSUE')}
                              type="button"
                            >
                              <span aria-hidden="true">✕</span>
                            </button>
                          </div>

                          {!item.configured ? <p className="status">Not configured in tenant checklist.</p> : null}
                        </article>
                      );
                    })}
                  </div>
                ))}
                <div className="paper-signatures">
                  <div>Sig. of Journey Manager</div>
                  <div>Sig. of Driver</div>
                </div>
              </div>

              <div className="paper-legend">
                <span>Tick where applicable:</span>
                <span>□ Yes / OK</span>
                <span>○ Not OK</span>
              </div>
            </section>

            {activeDefectKey ? (
              <div className="defect-sheet-overlay" onClick={() => setActiveDefectKey(null)} role="presentation">
                <div className="defect-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
                  <h3>Report Defect</h3>
                  <p className="status">
                    {(allUiItems.find((item) => item.uiKey === activeDefectKey)?.labelEn ?? 'Checklist item')}
                  </p>
                  <label className="field">
                    <span>Issue note</span>
                    <input
                      data-testid={`driver-checklist-issue-note-${activeDefectKey}`}
                      onChange={(event) => setNotes(activeDefectKey, event.target.value)}
                      placeholder="Short issue note"
                      type="text"
                      value={(itemState[activeDefectKey] ?? defaultItemState).notes}
                    />
                  </label>
                  <label className="field">
                    <span>Severity</span>
                    <select
                      data-testid={`driver-checklist-issue-severity-${activeDefectKey}`}
                      onChange={(event) =>
                        saveDraft({
                          ...itemState,
                          [activeDefectKey]: {
                            ...(itemState[activeDefectKey] ?? defaultItemState),
                            status: 'ISSUE',
                            severity: event.target.value === 'high' ? 'high' : 'low',
                          },
                        })
                      }
                      value={(itemState[activeDefectKey] ?? defaultItemState).severity}
                    >
                      <option value="low">Monitor</option>
                      <option value="high">Critical</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Issue photo</span>
                    <input
                      accept="image/*"
                      capture="environment"
                      data-testid={`driver-checklist-issue-photo-${activeDefectKey}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          setPendingPhotos((currentPhotos) => ({ ...currentPhotos, [activeDefectKey]: file }));
                          setPhoto(activeDefectKey, file.name);
                        }
                      }}
                      type="file"
                    />
                  </label>
                  {(itemState[activeDefectKey] ?? defaultItemState).photoName ? (
                    <p className="status">📷 {(itemState[activeDefectKey] ?? defaultItemState).photoName}</p>
                  ) : null}
                  <div className="defect-sheet-actions">
                    <button className="button ghost" onClick={() => setActiveDefectKey(null)} type="button">
                      Cancel
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        saveDefect(
                          activeDefectKey,
                          (itemState[activeDefectKey] ?? defaultItemState).notes,
                          (itemState[activeDefectKey] ?? defaultItemState).severity,
                          (itemState[activeDefectKey] ?? defaultItemState).photoName,
                        )
                      }
                      type="button"
                    >
                      Save defect
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="checklist-sticky-submit" data-testid="driver-checklist-sticky-submit">
              <div className="checklist-sticky-submit-meta">
                <strong>{answeredConfiguredItems.length} completed</strong>
                <span>{issueCount} issues</span>
                {remainingRequiredCount > 0 ? <span>{remainingRequiredCount} checks remaining</span> : null}
              </div>
              <button className="button" data-testid="driver-submit-daily-checklist" disabled={submitting || remainingRequiredCount > 0} onClick={onSubmit} type="button">
                {submitting ? 'Submitting...' : 'Submit inspection'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </DriverShell>
  );
}
