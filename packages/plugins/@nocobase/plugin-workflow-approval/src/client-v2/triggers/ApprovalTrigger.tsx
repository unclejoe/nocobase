/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please see: https://www.nocobase.com/agreement.
 */

/**
 * v2 (canvas) trigger descriptor for the approval trigger. Mirrors the v1
 * `ApprovalTriggerClient` in `src/client/index.ts`: the server-side trigger is
 * shared between canvases, only the config form needed a FlowEngine port.
 */

import { useFlowEngine } from '@nocobase/flow-engine';
import { RemoteSelect } from '@nocobase/client-v2';
import { Trigger, type LoaderOf } from '@nocobase/plugin-workflow/client-v2';
import { Form, Select } from 'antd';
import React from 'react';

import { useT } from '../locale';
import { APPROVAL_AUDIENCE_TYPE, NAMESPACE, TRIGGER_TYPE } from '../../common/constants';

export { TRIGGER_TYPE };

type AudienceValue = { type: string; targetKey?: number | string };

/**
 * v2 port of `AudienceSourceSelect` (see `src/client/instruction/AudienceSourceSelect.tsx`).
 * The value shape `{ type, targetKey }` matches the approvalAudiences table
 * columns; the workflows.afterSave hook mirrors `config.audiences` into it.
 * Uses the client-v2 `RemoteSelect` (request-based) instead of the v1
 * service-based one — v2 must not import from `@nocobase/client`.
 */
function AudienceSourceSelect({
  value,
  onChange,
}: {
  value?: AudienceValue;
  onChange?: (value: AudienceValue) => void;
}) {
  const t = useT();
  const type = value?.type ?? APPROVAL_AUDIENCE_TYPE.USER;

  const typeOptions = [
    { label: t('Specify users'), value: APPROVAL_AUDIENCE_TYPE.USER },
    { label: t('By role'), value: APPROVAL_AUDIENCE_TYPE.ROLE },
    { label: t('By department'), value: APPROVAL_AUDIENCE_TYPE.DEPARTMENT },
  ];

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Select
        style={{ flex: '0 0 auto' }}
        options={typeOptions}
        value={type}
        onChange={(next) => onChange?.({ type: next, targetKey: undefined })}
      />
      <AudienceTargetSelect
        type={type}
        value={value?.targetKey}
        onChange={(targetKey) => onChange?.({ type, targetKey })}
      />
    </div>
  );
}

function AudienceTargetSelect({
  type,
  value,
  onChange,
}: {
  type: string;
  value?: number | string;
  onChange?: (value: number | string) => void;
}) {
  const flowEngine = useFlowEngine();

  const request = async () => {
    const resource =
      type === APPROVAL_AUDIENCE_TYPE.USER ? 'users' : type === APPROVAL_AUDIENCE_TYPE.ROLE ? 'roles' : 'departments';
    const response = await flowEngine.context.api.resource(resource).list({ pageSize: 500 });
    return response?.data?.data ?? [];
  };

  const mapOptions = (item: { id?: number; nickname?: string; title?: string; name?: string }) => {
    if (type === APPROVAL_AUDIENCE_TYPE.ROLE) {
      return { label: item.title ?? item.name, value: item.name };
    }
    return {
      label: type === APPROVAL_AUDIENCE_TYPE.USER ? item.nickname ?? item.id : item.title ?? item.id,
      value: item.id,
    };
  };

  return (
    <RemoteSelect
      style={{ flex: 1 }}
      request={request}
      mapOptions={mapOptions}
      value={value}
      onChange={onChange}
      cacheKey={`workflow-approval:audience:${type}`}
    />
  );
}

function ApproverSourceSelect({ value, onChange }: { value?: string; onChange?: (value: string) => void }) {
  const flowEngine = useFlowEngine();
  const t = useT();

  const request = async () => {
    const response = await flowEngine.context.api.resource('collections').list({ pageSize: 500 });
    return response?.data?.data ?? [];
  };

  return (
    <RemoteSelect
      showSearch
      request={request}
      mapOptions={(item: { title?: string; title_i18n?: string; name: string }) => ({
        label: item.title ?? item.name,
        value: item.name,
      })}
      value={value}
      onChange={onChange}
      placeholder={t('Please select a collection')}
      cacheKey="workflow-approval:approver-source"
    />
  );
}

function AudiencesEditor({
  value,
  onChange,
}: {
  value?: AudienceValue[];
  onChange?: (value: AudienceValue[]) => void;
}) {
  const t = useT();
  const items = value ?? [];

  const update = (next: AudienceValue[]) => onChange?.(next);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <AudienceSourceSelect
            value={item}
            onChange={(next) => update(items.map((it, i) => (i === index ? next : it)))}
          />
          <a onClick={() => update(items.filter((_, i) => i !== index))}>{t('Remove')}</a>
        </div>
      ))}
      <a onClick={() => update([...items, { type: APPROVAL_AUDIENCE_TYPE.USER }])}>{t('Add audience')}</a>
    </div>
  );
}

export function ApprovalTriggerConfig() {
  const t = useT();

  return (
    <fieldset>
      <Form.Item name={['config', 'collection']} label={t('Approver source')} rules={[{ required: true }]}>
        <ApproverSourceSelect />
      </Form.Item>
      <Form.Item
        name={['config', 'audiences']}
        label={t('Audience')}
        extra={t(
          "Who can view this workflow's approvals. Leave empty to keep approvals visible to all logged-in users.",
        )}
      >
        <AudiencesEditor />
      </Form.Item>
    </fieldset>
  );
}

export default class ApprovalTriggerV2 extends Trigger {
  title = `{{t("Approval trigger", { ns: "${NAMESPACE}" })}}`;
  description = `{{t("Triggered when a record is submitted for approval. The workflow then routes the request to approvers and drives the approval flow.", { ns: "${NAMESPACE}" })}}`;

  FieldsetLoader: LoaderOf = () =>
    import('./ApprovalTrigger').then((module) => ({ default: module.ApprovalTriggerConfig }));

  validate(config: Record<string, unknown>) {
    return Boolean(config?.collection);
  }
}
