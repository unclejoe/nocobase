/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useAPIClient, useCollectionManager } from '@nocobase/client';
import { useRequest } from 'ahooks';
import { Alert, App as AntdApp, Button, Checkbox, Space, Spin, Table } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CONFIG_COLLECTION_NAME } from '../../constants';

type ActionName = 'create' | 'update' | 'destroy';
const ACTIONS: ActionName[] = ['create', 'update', 'destroy'];

interface CollectionLite {
  name: string;
  title?: string;
  hidden?: boolean;
  viewName?: string;
  isThrough?: boolean;
  template?: string;
}

interface ConfigRow {
  id: number;
  collection: string;
  action: string;
}

// selection keyed by collection name -> set of enabled actions.
type Selection = Record<string, Set<ActionName>>;

// Business collections worth offering for auditing: exclude hidden, DB-view,
// and M2M through tables. (System collections aren't surfaced here at all
// because we only ever register explicit `<collection>:<action>` entries on
// the server, never bare global names.)
function isBusinessCollection(c: CollectionLite): boolean {
  return !c.hidden && !c.viewName && !c.isThrough;
}

export const AuditConfigPanel = () => {
  const { t } = useTranslation('@nocobase/plugin-audit-logger', { nsMode: 'fallback' });
  const cm = useCollectionManager();
  const api = useAPIClient();
  const { message } = AntdApp.useApp();

  // All business collections, stable order by title then name.
  const collections = useMemo<CollectionLite[]>(() => {
    const all = (cm?.getCollections?.() || []) as CollectionLite[];
    return all.filter(isBusinessCollection).sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
  }, [cm]);

  // Load the current saved configuration rows.
  const configReq = useRequest(async () => {
    const res = await api.resource(CONFIG_COLLECTION_NAME).list({ pageSize: -1 });
    return (res?.data?.data as ConfigRow[]) ?? [];
  }, []);

  // The initial selection derived from saved rows. Recomputed whenever rows
  // reload, so cancelling a toggle and re-fetching snaps back to saved state.
  const initialSelection = useMemo<Selection>(() => {
    const sel: Selection = {};
    for (const row of configReq.data || []) {
      if (!ACTIONS.includes(row.action as ActionName)) continue;
      (sel[row.collection] ||= new Set<ActionName>()).add(row.action as ActionName);
    }
    return sel;
  }, [configReq.data]);

  // Local working copy. Reset to initial whenever the saved config reloads.
  const [draft, setDraft] = useState<Selection>({});
  useEffect(() => {
    setDraft(Object.fromEntries(Object.entries(initialSelection).map(([k, v]) => [k, new Set(v)])) as Selection);
  }, [initialSelection]);

  const toggle = useCallback((collection: string, action: ActionName) => {
    setDraft((prev) => {
      const next: Selection = { ...prev };
      const set = new Set(next[collection]);
      if (set.has(action)) {
        set.delete(action);
      } else {
        set.add(action);
      }
      if (set.size === 0) {
        delete next[collection];
      } else {
        next[collection] = set;
      }
      return next;
    });
  }, []);

  // Has the working copy diverged from what's saved? Drives the Save button.
  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(draft), ...Object.keys(initialSelection)]);
    for (const k of keys) {
      const a = draft[k] || new Set<ActionName>();
      const b = initialSelection[k] || new Set<ActionName>();
      if (a.size !== b.size) return true;
      for (const x of a) if (!b.has(x)) return true;
    }
    return false;
  }, [draft, initialSelection]);

  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      // Compute the diff against saved rows, then apply only the changes so we
      // don't churn rows the admin didn't touch.
      const toAdd: { collection: string; action: ActionName }[] = [];
      const toRemoveIds: number[] = [];

      const savedIdByPair = new Map<string, number>();
      for (const row of configReq.data || []) {
        if (ACTIONS.includes(row.action as ActionName)) {
          savedIdByPair.set(`${row.collection}:${row.action}`, row.id);
        }
      }

      const wantPair = new Set<string>();
      for (const [collection, actions] of Object.entries(draft)) {
        for (const action of actions) {
          wantPair.add(`${collection}:${action}`);
        }
      }

      for (const [pair, id] of savedIdByPair) {
        if (!wantPair.has(pair)) toRemoveIds.push(id);
      }
      for (const pair of wantPair) {
        if (!savedIdByPair.has(pair)) {
          const [collection, action] = pair.split(':') as [string, ActionName];
          toAdd.push({ collection, action });
        }
      }

      await Promise.all(toRemoveIds.map((id) => api.resource(CONFIG_COLLECTION_NAME).destroy({ filterByTk: id })));
      if (toAdd.length) {
        await api.resource(CONFIG_COLLECTION_NAME).create({ values: toAdd });
      }

      message.success(t('Audit configuration saved'));
      await configReq.refresh();
    } catch {
      message.error(t('Failed to save audit configuration'));
    } finally {
      setSaving(false);
    }
  }, [api, configReq, draft, message, t]);

  const loading = configReq.loading;

  const columns = useMemo(
    () => [
      {
        title: t('Collection'),
        dataIndex: 'name',
        key: 'name',
        render: (_: unknown, record: CollectionLite) => record.title || record.name,
      },
      ...ACTIONS.map((action) => ({
        title: t(action),
        key: action,
        width: 120,
        align: 'center' as const,
        render: (_: unknown, record: CollectionLite) => (
          <Checkbox
            checked={!!draft[record.name]?.has(action)}
            onChange={() => toggle(record.name, action)}
            aria-label={`${t('Audit')} ${t(action)} - ${record.title || record.name}`}
          />
        ),
      })),
    ],
    [draft, toggle, t],
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('Audit configuration')}
        description={t(
          'Select which collections and actions (create / update / destroy) are recorded in the audit log. Changes take effect immediately.',
        )}
      />
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" loading={saving} disabled={!dirty} onClick={save}>
          {t('Save')}
        </Button>
      </Space>
      <Table<CollectionLite>
        rowKey="name"
        size="small"
        columns={columns}
        dataSource={collections}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        scroll={{ y: 480 }}
      />
    </div>
  );
};
