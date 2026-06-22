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
 * Copyright (c) 2020-2024 NocoBase Co, Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

// Client-facing collection definition used by the v2 data source so the audit
// log page can resolve field interfaces for filtering. The authoritative
// (database) definition lives in src/server/collections/auditTrails.ts.
export default {
  name: 'auditTrails',
  dataCategory: 'business',
  migrationRules: ['schema-only'],
  title: 'AuditTrails',
  fields: [
    {
      name: 'id',
      type: 'bigInt',
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      interface: 'id',
      uiSchema: {
        type: 'string',
        title: '{{t("ID")}}',
        'x-component': 'Input',
        'x-read-pretty': true,
      },
    },
    {
      name: 'resource',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("Resource")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'action',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("Action")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'userId',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("User ID")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'roleName',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("Role")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'ip',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("IP")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'ua',
      type: 'text',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("User agent")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'status',
      type: 'integer',
      interface: 'integer',
      uiSchema: {
        type: 'number',
        title: '{{t("Status")}}',
        'x-component': 'InputNumber',
      },
    },
    {
      name: 'dataSource',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("Data source")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'requestSource',
      type: 'string',
      interface: 'input',
      uiSchema: {
        type: 'string',
        title: '{{t("Request source")}}',
        'x-component': 'Input',
      },
    },
    {
      name: 'metadata',
      type: 'json',
      interface: 'json',
      uiSchema: {
        type: 'object',
        title: '{{t("Metadata")}}',
        'x-component': 'Input.JSON',
      },
    },
    {
      name: 'createdAt',
      type: 'date',
      interface: 'createdAt',
      field: 'createdAt',
      uiSchema: {
        type: 'datetime',
        title: '{{t("Created at")}}',
        'x-component': 'DatePicker',
        'x-component-props': { showTime: true },
        'x-read-pretty': true,
      },
    },
  ],
};
