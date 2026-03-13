export type GroupName =
  | 'Mechanical & Exterior'
  | 'Fluids & Electrical'
  | 'Safety & Emergency'
  | 'Operational Controls'
  | 'Documentation & Tools';

export type PaperUiStatus = 'PASS' | 'ISSUE' | null;

export interface PaperTemplateItem {
  key: string;
  labelEn: string;
  labelAr: string;
  icon: string;
  aliases: string[];
}

export interface PaperChecklistItem {
  uiKey: string;
  labelEn: string;
  labelAr: string;
  icon: string;
  group: GroupName;
  configured: boolean;
  required: boolean;
  apiItemCode?: string;
}

export interface PaperChecklistRow {
  cells: Array<{
    uiKey: string;
    item: PaperChecklistItem;
  }>;
}

export interface PaperChecklistModel {
  rows: PaperChecklistRow[];
  visibleItems: PaperChecklistItem[];
  configuredItems: PaperChecklistItem[];
}

export interface ChecklistMasterLikeSection {
  items: Array<{ item_code: string; item_name: string; required: boolean }>;
}

const GROUP_ORDER: GroupName[] = [
  'Mechanical & Exterior',
  'Fluids & Electrical',
  'Safety & Emergency',
  'Operational Controls',
  'Documentation & Tools',
];

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
  ],
};

const PAPER_ROW_LAYOUT: Array<{
  cells: Array<{ key: string; group: GroupName }>;
}> = [
  { cells: [{ group: 'Mechanical & Exterior', key: 'body' }, { group: 'Fluids & Electrical', key: 'battery' }, { group: 'Safety & Emergency', key: 'first-aid' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'steering' }, { group: 'Fluids & Electrical', key: 'oil' }, { group: 'Safety & Emergency', key: 'extinguisher' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'wipers' }, { group: 'Fluids & Electrical', key: 'water' }, { group: 'Documentation & Tools', key: 'tools' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'indicators' }, { group: 'Safety & Emergency', key: 'horn' }, { group: 'Documentation & Tools', key: 'jack' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'tyres' }, { group: 'Fluids & Electrical', key: 'fuel' }, { group: 'Safety & Emergency', key: 'brakes' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'mirrors' }, { group: 'Safety & Emergency', key: 'seatbelt' }, { group: 'Operational Controls', key: 'radio' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'load' }, { group: 'Documentation & Tools', key: 'registration' }, { group: 'Documentation & Tools', key: 'ras' }] },
  { cells: [{ group: 'Mechanical & Exterior', key: 'reverse' }, { group: 'Operational Controls', key: 'speed' }, { group: 'Documentation & Tools', key: 'aircon' }] },
  { cells: [{ group: 'Documentation & Tools', key: 'lock' }, { group: 'Operational Controls', key: 'measure' }, { group: 'Operational Controls', key: 'tyre-pressure' }, { group: 'Operational Controls', key: 'high-flag' }, { group: 'Operational Controls', key: 'plate-visible' }] },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function templateUiKey(group: GroupName, key: string) {
  return `${group}:${key}`;
}

export function buildPaperChecklistModel(sections: ChecklistMasterLikeSection[]): PaperChecklistModel {
  const masterItems = sections.flatMap((section) => section.items);
  const remaining = [...masterItems];
  const grouped = Object.fromEntries(GROUP_ORDER.map((group) => [group, [] as PaperChecklistItem[]])) as Record<GroupName, PaperChecklistItem[]>;

  for (const group of GROUP_ORDER) {
    for (const templateItem of PAPER_TEMPLATE[group]) {
      const matchedIndex = remaining.findIndex((item) => {
        const itemName = normalize(item.item_name);
        return templateItem.aliases.some((alias) => itemName.includes(normalize(alias)));
      });
      const matched = matchedIndex >= 0 ? remaining.splice(matchedIndex, 1)[0] : null;
      grouped[group].push({
        uiKey: templateUiKey(group, templateItem.key),
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

  const byUiKey = new Map<string, PaperChecklistItem>();
  for (const group of GROUP_ORDER) {
    for (const item of grouped[group]) {
      byUiKey.set(item.uiKey, item);
    }
  }

  const rows = PAPER_ROW_LAYOUT.map((row) => ({
    cells: row.cells.flatMap((cell) => {
      const key = templateUiKey(cell.group, cell.key);
      const item = byUiKey.get(key);
      if (!item?.configured) return [];
      return [{ uiKey: key, item }];
    }),
  })).filter((row) => row.cells.length > 0);

  const visibleItems = rows.flatMap((row) => row.cells.map((cell) => cell.item));
  const configuredItems = visibleItems.filter((item) => item.configured && item.apiItemCode);
  return { rows, visibleItems, configuredItems };
}

export interface PaperChecklistRendererProps {
  mode: 'driver' | 'admin' | 'print';
  rows: PaperChecklistRow[];
  statuses: Record<string, PaperUiStatus>;
  activeDefectKey?: string | null;
  testIdPrefix?: string;
  onPickStatus?: (uiKey: string, status: Exclude<PaperUiStatus, null>) => void;
  cardRef?: (uiKey: string, element: HTMLElement | null) => void;
}

export function PaperChecklistRenderer({
  mode,
  rows,
  statuses,
  activeDefectKey = null,
  testIdPrefix = 'checklist',
  onPickStatus,
  cardRef,
}: PaperChecklistRendererProps) {
  const readOnly = mode !== 'driver';
  return (
    <section className="paper-form" data-testid={`${testIdPrefix}-paper-form`}>
      <div className="paper-grid">
        {rows.map((row, rowIndex) => (
          <div
            className={`paper-row ${
              row.cells.length === 5
                ? 'paper-row-five'
                : row.cells.length === 1
                  ? 'paper-row-one'
                  : row.cells.length === 2
                    ? 'paper-row-two'
                    : 'paper-row-three'
            }`}
            key={`paper-row-${rowIndex + 1}`}
          >
            {row.cells.map(({ item, uiKey }) => {
              const status = statuses[uiKey] ?? null;
              const isIssue = status === 'ISSUE';
              return (
                <article
                  className={`checklist-card paper-cell ${activeDefectKey === item.uiKey ? 'defect-source-active' : ''}`}
                  data-testid={`${testIdPrefix}-item-${item.uiKey}`}
                  key={uiKey}
                  ref={(element) => {
                    cardRef?.(item.uiKey, element);
                  }}
                  tabIndex={readOnly ? undefined : -1}
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
                    {readOnly ? (
                      <>
                        <span className={`paper-check pass ${status === 'PASS' ? 'active pass' : ''}`} aria-label="PASS" data-testid={`${testIdPrefix}-pass-${item.uiKey}`}>
                          <span aria-hidden="true">✓</span>
                        </span>
                        <span className={`paper-check issue ${isIssue ? 'active issue' : ''}`} aria-label="ISSUE" data-testid={`${testIdPrefix}-issue-${item.uiKey}`}>
                          <span aria-hidden="true">✕</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <button
                          aria-label="PASS"
                          className={`paper-check pass ${status === 'PASS' ? 'active pass' : ''}`}
                          data-testid={`${testIdPrefix}-pass-${item.uiKey}`}
                          disabled={!item.configured}
                          onClick={() => onPickStatus?.(item.uiKey, 'PASS')}
                          type="button"
                        >
                          <span aria-hidden="true">✓</span>
                        </button>
                        <button
                          aria-label="ISSUE"
                          className={`paper-check issue ${isIssue ? 'active issue' : ''}`}
                          data-testid={`${testIdPrefix}-issue-${item.uiKey}`}
                          disabled={!item.configured}
                          onClick={() => onPickStatus?.(item.uiKey, 'ISSUE')}
                          type="button"
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
