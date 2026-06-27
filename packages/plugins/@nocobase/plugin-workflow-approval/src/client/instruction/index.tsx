/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Approval instruction node UI (v1 / SchemaComponent workflow designer).
 *
 * Registers the "approval" node in the workflow canvas with a fieldset for
 * configuring the approver source, countersign mode, and title.
 */

import React from 'react';
import { Instruction } from '@nocobase/plugin-workflow/client';
import { ApproverSourceSelect } from './ApproverSourceSelect';
import { APPROVAL_MODE, INSTRUCTION_TYPE } from '../../common/constants';
import { lang } from '../../locale';

const MODE_OPTIONS = [
  { label: lang('Single approver'), value: APPROVAL_MODE.SINGLE },
  { label: lang('Countersign (all must approve)'), value: APPROVAL_MODE.ALL },
  { label: lang('Or-sign (any one approves)'), value: APPROVAL_MODE.ANY },
];

export default class ApprovalInstructionClient extends Instruction {
  title = lang('Approval node');
  type = INSTRUCTION_TYPE;
  group = 'manual';
  // The node suspends the workflow (awaiting approvers) then resumes.
  async = true;

  components = {
    ApproverSourceSelect,
  };

  fieldset = {
    assignees: {
      type: 'array',
      title: lang('Approver source'),
      required: true,
      'x-decorator': 'FormItem',
      'x-component': 'ArrayItems',
      'x-component-props': { className: 'wf-approval-assignees' },
      items: {
        type: 'object',
        properties: {
          sort: {
            type: 'void',
            'x-component': 'ArrayItems.SortHandle',
          },
          source: {
            type: 'object',
            'x-component': 'ApproverSourceSelect',
            'x-decorator': 'FormItem',
            default: { source: 'user' },
          },
          remove: {
            type: 'void',
            'x-component': 'ArrayItems.Remove',
          },
        },
      },
      properties: {
        add: {
          type: 'void',
          title: lang('Approver source'),
          'x-component': 'ArrayItems.Addition',
        },
      },
    },
    mode: {
      type: 'number',
      title: lang('Approval status'),
      'x-decorator': 'FormItem',
      'x-component': 'Select',
      enum: MODE_OPTIONS,
      default: APPROVAL_MODE.SINGLE,
    },
    title: {
      type: 'string',
      title: lang('Approval node'),
      'x-decorator': 'FormItem',
      'x-component': 'Input',
    },
  };
}
