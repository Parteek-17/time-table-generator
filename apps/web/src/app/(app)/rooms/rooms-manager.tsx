'use client';

import { ROOM_TYPES, type BuildingRow, type RoomRow } from '@slotwise/shared';
import { Badge } from '@slotwise/ui';
import { useTranslations } from 'next-intl';
import {
  EntityForm,
  type FieldSpec,
  type Option,
  type Values,
} from '@/components/entity/entity-form';
import { AddPanel, EntityList } from '@/components/entity/entity-list';

export function RoomsManager({
  rooms,
  buildings,
  departments,
  canManage,
}: {
  rooms: RoomRow[];
  buildings: BuildingRow[];
  departments: Option[];
  canManage: boolean;
}) {
  const t = useTranslations('rooms');
  const tEnum = useTranslations('enums');
  const tEntity = useTranslations('entity');
  const buildingFields: FieldSpec[] = [
    { name: 'name', label: t('buildingName'), type: 'text', placeholder: 'Main Block' },
    { name: 'code', label: t('buildingCode'), type: 'text', half: true, optional: true },
    { name: 'floors', label: t('floors'), type: 'number', half: true, min: 1 },
  ];
  const roomFields: FieldSpec[] = [
    { name: 'code', label: t('code'), type: 'text', half: true, placeholder: 'G16' },
    {
      name: 'type',
      label: t('type'),
      type: 'select',
      half: true,
      options: ROOM_TYPES.map((r) => ({ value: r, label: tEnum(`roomType.${r}`) })),
    },
    {
      name: 'buildingId',
      label: t('building'),
      type: 'select',
      half: true,
      options: buildings.filter((b) => !b.archivedAt).map((b) => ({ value: b.id, label: b.name })),
    },
    {
      name: 'floor',
      label: t('floor'),
      hint: t('floorHint'),
      type: 'number',
      half: true,
      min: -2,
      max: 50,
    },
    {
      name: 'labCategories',
      label: t('labCategories'),
      hint: t('labCategoriesHint'),
      type: 'list',
      placeholder: 'Software lab',
      show: (v) => v.type === 'lab',
    },
    { name: 'rows', label: t('rows'), type: 'number', half: true, optional: true, min: 0 },
    {
      name: 'seatsPerRow',
      label: t('seatsPerRow'),
      type: 'number',
      half: true,
      optional: true,
      min: 0,
    },
    {
      name: 'capacityOverride',
      label: t('capacityOverride'),
      hint: t('capacityHint'),
      type: 'number',
      half: true,
      optional: true,
      min: 0,
    },
    {
      name: 'examSeatsPerBench',
      label: t('examSeatsPerBench'),
      hint: t('examSeatsHint'),
      type: 'number',
      half: true,
      optional: true,
      min: 0,
      max: 4,
    },
    {
      name: 'ownerDepartmentId',
      label: t('owner'),
      type: 'select',
      half: true,
      optional: true,
      emptyLabel: t('noOwner'),
      options: departments,
    },
    { name: 'isShared', label: t('isShared'), type: 'checkbox' },
    {
      name: 'isAccessible',
      label: t('isAccessible'),
      hint: t('isAccessibleHint'),
      type: 'checkbox',
    },
  ];
  const blankRoom: Values = {
    code: '',
    type: 'lecture',
    buildingId: buildings[0]?.id ?? '',
    floor: 0,
    labCategories: [],
    rows: null,
    seatsPerRow: null,
    capacityOverride: null,
    examSeatsPerBench: null,
    ownerDepartmentId: null,
    isShared: true,
    isAccessible: false,
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3" aria-labelledby="buildings-heading">
        <h2 id="buildings-heading" className="text-lg font-semibold">
          {t('buildings')}
        </h2>
        {canManage ? (
          <AddPanel label={t('addBuilding')}>
            {(close) => (
              <EntityForm
                fields={buildingFields}
                initial={{ name: '', code: null, floors: 1 }}
                path="/buildings"
                id={null}
                revalidate="/rooms"
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <EntityList
          rows={buildings}
          path="/buildings"
          revalidate="/rooms"
          name={(b) => b.name}
          title={(b) => b.name}
          subtitle={(b) => t('buildingLine', { floors: b.floors, rooms: b.roomCount })}
          canEdit={() => canManage}
          empty={t('noBuildings')}
          edit={(b, close) => (
            <EntityForm
              fields={buildingFields}
              initial={b as unknown as Values}
              path="/buildings"
              id={b.id}
              revalidate="/rooms"
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="rooms-heading">
        <h2 id="rooms-heading" className="text-lg font-semibold">
          {t('rooms')}
        </h2>
        {canManage && buildings.length > 0 ? (
          <AddPanel label={t('addRoom')}>
            {(close) => (
              <EntityForm
                fields={roomFields}
                initial={blankRoom}
                path="/rooms"
                id={null}
                revalidate="/rooms"
                submitLabel={tEntity('add')}
                onCancel={close}
              />
            )}
          </AddPanel>
        ) : null}
        <EntityList
          rows={rooms}
          path="/rooms"
          revalidate="/rooms"
          name={(r) => r.code}
          title={(r) => r.code}
          subtitle={(r) => (
            <span className="flex flex-wrap items-center gap-1">
              <span>
                {tEnum(`roomType.${r.type}`)} · {r.buildingName} ·{' '}
                {t('floorShort', { floor: r.floor })} · {t('seats', { count: r.classCapacity })}
              </span>
              {r.labCategories.map((c) => (
                <Badge key={c}>{c}</Badge>
              ))}
              {r.isAccessible ? <Badge>{t('accessible')}</Badge> : null}
            </span>
          )}
          searchText={(r) => `${r.code} ${r.buildingName} ${r.labCategories.join(' ')}`}
          canEdit={() => canManage}
          empty={t('noRooms')}
          edit={(r, close) => (
            <EntityForm
              fields={roomFields}
              initial={r as unknown as Values}
              path="/rooms"
              id={r.id}
              revalidate="/rooms"
              submitLabel={tEntity('save')}
              onSaved={close}
              onCancel={close}
            />
          )}
        />
      </section>
    </div>
  );
}
