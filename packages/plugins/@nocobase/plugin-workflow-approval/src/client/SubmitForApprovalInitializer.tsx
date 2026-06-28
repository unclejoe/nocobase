/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * "Submit for approval" record action button (v1 SchemaComponent).
 *
 * Registers an action-initializer item that an admin can drop onto a business
 * record's detail/form/table actions. When clicked it calls the
 * `approvals:submit` API with the current record id + a configured approval
 * workflow, then refreshes.
 *
 * Mirrors plugin-workflow-custom-action-trigger's recordTriggerWorkflowActionInitializer.
 */

import type { SchemaInitializerItemType } from '@nocobase/client';
import { useAPIClient, useRecord } from '@nocobase/client';
import { App, Button } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { NAMESPACE, lang } from '../locale';

/** Props hook for the action button: submits the current record for approval. */
export function useSubmitForApprovalActionProps() {
  const api = useAPIClient();
  const record = useRecord();
  const { t } = useTranslation();
  // The configured approval workflow id is stored on the action's x-action-settings.
  // `this` is bound by the v1 action framework to those settings.
  type ActionSettings = { workflowId?: string | number; collectionName?: string };
  return {
    async onClick(this: ActionSettings) {
      const workflowId = this.workflowId;
      const collectionName = record?.__collectionName || this.collectionName;
      if (!workflowId) {
        return;
      }
      await api.resource('approvals').submit({
        values: {
          collection: collectionName,
          dataKey: record?.id,
          workflowId,
        },
      });
      window.location.reload();
      void t;
    },
  };
}

/** The rendered button (used directly when not going through SchemaInitializer). */
export function SubmitForApprovalAction() {
  const { t } = useTranslation(NAMESPACE);
  return <Button type="primary">{t('Submit for approval')}</Button>;
}

/** Initializer item — appears in the "Configure actions" menu of a record block. */
export const submitForApprovalActionInitializer: SchemaInitializerItemType = {
  name: 'approval.submit',
  title: lang('Submit for approval'),
  Component: 'CustomizeActionInitializer',
  schema: {
    title: lang('Submit for approval'),
    'x-component': 'Action',
    'x-use-component-props': 'useSubmitForApprovalActionProps',
    'x-decorator': 'ACLActionProvider',
    'x-action-settings': {
      onSuccess: {
        manualClose: true,
        redirecting: false,
        successMessage: '{{t("Approval submitted successfully", { ns: "' + NAMESPACE + '" })}}',
      },
      workflowId: null,
    },
    'x-toolbar-props': {
      initializer: false,
      showBorder: false,
    },
  },
};
