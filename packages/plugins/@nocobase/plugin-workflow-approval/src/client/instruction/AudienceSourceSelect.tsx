/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * AudienceSourceSelect — v1 component for configuring a workflow's approval
 * audience (§4.7). Lets the admin pick an audience kind (user / role /
 * department) and a target. Unlike ApproverSourceSelect it has no supervisor
 * branch (audiences are absolute, not applicant-relative).
 *
 * The value shape is `{ type, targetKey }` to match the approvalAudiences
 * table columns; the workflows.afterSave hook (see Plugin.ts) mirrors these
 * from `config.audiences` into the table.
 */

import React from 'react';
import { Select, RemoteSelect } from '@nocobase/client';
import { lang } from '../../locale';
import { APPROVAL_AUDIENCE_TYPE } from '../../common/constants';

const TYPE_OPTIONS = [
  { label: lang('Specify users'), value: APPROVAL_AUDIENCE_TYPE.USER },
  { label: lang('By role'), value: APPROVAL_AUDIENCE_TYPE.ROLE },
  { label: lang('By department'), value: APPROVAL_AUDIENCE_TYPE.DEPARTMENT },
];

interface Props {
  value?: { type: string; targetKey?: number | string };
  onChange?: (value: { type: string; targetKey?: number | string }) => void;
}

export function AudienceSourceSelect({ value = { type: APPROVAL_AUDIENCE_TYPE.USER }, onChange }: Props) {
  const type = value.type ?? APPROVAL_AUDIENCE_TYPE.USER;

  const handleTypeChange = (next: string) => {
    onChange?.({ type: next, targetKey: undefined });
  };

  const handleTargetChange = (targetKey: number | string) => {
    onChange?.({ ...value, targetKey });
  };

  const renderTarget = () => {
    switch (type) {
      case APPROVAL_AUDIENCE_TYPE.USER:
        return (
          <RemoteSelect
            fieldNames={{ label: 'nickname', value: 'id' }}
            service={{ resource: 'users' }}
            manual={false}
            value={value.targetKey}
            onChange={(v: number | string) => handleTargetChange(v)}
          />
        );
      case APPROVAL_AUDIENCE_TYPE.ROLE:
        return (
          <RemoteSelect
            fieldNames={{ label: 'title', value: 'name' }}
            service={{ resource: 'roles' }}
            manual={false}
            value={value.targetKey}
            onChange={(v: number | string) => handleTargetChange(v)}
          />
        );
      case APPROVAL_AUDIENCE_TYPE.DEPARTMENT:
        return (
          <RemoteSelect
            fieldNames={{ label: 'title', value: 'id' }}
            service={{ resource: 'departments' }}
            manual={false}
            value={value.targetKey}
            onChange={(v: number | string) => handleTargetChange(v)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Select style={{ flex: '0 0 auto' }} options={TYPE_OPTIONS} value={type} onChange={handleTypeChange} />
      {renderTarget()}
    </div>
  );
}
