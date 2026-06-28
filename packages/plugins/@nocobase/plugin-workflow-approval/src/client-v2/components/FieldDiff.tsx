/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * FieldDiff — renders the field-level change diff (§4.2) for an approval record.
 *
 * Accepts the `changes` payload stored on approvalRecords (an array of
 * { field, before, after }) and renders a compact, accessible list: each row
 * shows the field name with the old value struck-through in red followed by the
 * new value in green. Renders nothing when there are no changes.
 */

import { Typography } from 'antd';
import React from 'react';

import { useT } from '../locale';

const { Text } = Typography;

interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

function isFieldChangeArray(value: unknown): value is FieldChange[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === 'object' && 'field' in item)
  );
}

function formatValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export interface FieldDiffProps {
  /** The changes payload from approvalRecords.changes (array form). */
  changes: unknown;
}

export function FieldDiff({ changes }: FieldDiffProps) {
  const t = useT();
  if (!isFieldChangeArray(changes)) {
    return null;
  }
  return (
    <div style={{ marginTop: 4 }} aria-label={t('Changed fields')}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        {t('Changed fields')}:
      </Text>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {changes.map((c) => {
          const before = formatValue(c.before);
          const after = formatValue(c.after);
          return (
            <li key={c.field}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {c.field}:
              </Text>{' '}
              {before ? (
                <Text delete type="danger" style={{ fontSize: 12 }}>
                  {before}
                </Text>
              ) : null}{' '}
              {after ? (
                <Text type="success" style={{ fontSize: 12 }}>
                  {after}
                </Text>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default FieldDiff;
