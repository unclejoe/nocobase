/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * ApproverSourceSelect — v1 component for configuring an approver source in the
 * approval node designer. Lets the admin pick a source kind (user / role /
 * department / supervisor) and a target.
 */

import React from 'react';
import { Select, RemoteSelect } from '@nocobase/client';
import { lang } from '../../locale';
import { APPROVER_SOURCE } from '../../common/constants';

const SOURCE_OPTIONS = [
  { label: lang('Specify users'), value: APPROVER_SOURCE.USER },
  { label: lang('By role'), value: APPROVER_SOURCE.ROLE },
  { label: lang('By department'), value: APPROVER_SOURCE.DEPARTMENT },
  { label: lang('Direct supervisor'), value: APPROVER_SOURCE.SUPERVISOR },
];

interface Props {
  value?: { source: string; targetId?: number | string; onlyMain?: boolean };
  onChange?: (value: { source: string; targetId?: number | string; onlyMain?: boolean }) => void;
}

export function ApproverSourceSelect({ value = { source: APPROVER_SOURCE.USER }, onChange }: Props) {
  const source = value.source ?? APPROVER_SOURCE.USER;

  const handleSourceChange = (next: string) => {
    onChange?.({ source: next, targetId: undefined });
  };

  const handleTargetChange = (targetId: number | string) => {
    onChange?.({ ...value, targetId });
  };

  const renderTarget = () => {
    switch (source) {
      case APPROVER_SOURCE.USER:
        return (
          <RemoteSelect
            fieldNames={{ label: 'nickname', value: 'id' }}
            service={{ resource: 'users' }}
            manual={false}
            value={value.targetId}
            onChange={(v) => handleTargetChange(v)}
          />
        );
      case APPROVER_SOURCE.ROLE:
        return (
          <RemoteSelect
            fieldNames={{ label: 'title', value: 'name' }}
            service={{ resource: 'roles' }}
            manual={false}
            value={value.targetId}
            onChange={(v) => handleTargetChange(v)}
          />
        );
      case APPROVER_SOURCE.DEPARTMENT:
        return (
          <RemoteSelect
            fieldNames={{ label: 'title', value: 'id' }}
            service={{ resource: 'departments' }}
            manual={false}
            value={value.targetId}
            onChange={(v) => handleTargetChange(v)}
          />
        );
      case APPROVER_SOURCE.SUPERVISOR:
        // No target needed — resolved from the applicant's main department.
        return null;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Select style={{ flex: '0 0 auto' }} options={SOURCE_OPTIONS} value={source} onChange={handleSourceChange} />
      {renderTarget()}
    </div>
  );
}
