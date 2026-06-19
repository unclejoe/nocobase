/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import Joi from 'joi';
import { Trigger, type EventOptions, type WorkflowModel } from '@nocobase/plugin-workflow';
import type PluginWorkflowServer from '@nocobase/plugin-workflow';
import { type Context, type Next } from '@nocobase/actions';
import { HTTP_METHODS } from '../common/constants';

type WebhookConfig = {
  methods?: string[];
  secret?: string;
};

type TriggerValues = {
  data?: Record<string, unknown>;
};

export default class WebhookTrigger extends Trigger {
  static TYPE = 'webhook';

  configSchema = Joi.object({
    methods: Joi.array()
      .items(Joi.string().valid(...HTTP_METHODS))
      .min(1)
      .default(['POST']),
    secret: Joi.string().allow(null, '').optional(),
  });

  constructor(workflow: PluginWorkflowServer) {
    super(workflow);

    this.workflow.app.resourceManager.define({
      name: 'webhooks',
      actions: {
        trigger: (ctx: Context, next: Next) => this.handleWebhook(ctx, next),
      },
    });

    this.workflow.app.acl.allow('webhooks', 'trigger', 'public');
  }

  on(_workflow: WorkflowModel): void {}

  off(_workflow: WorkflowModel): void {}

  private findWorkflowByKey(key: string): WorkflowModel | undefined {
    for (const workflow of this.workflow.enabledCache.values()) {
      if (workflow.key === key && workflow.type === WebhookTrigger.TYPE) {
        return workflow;
      }
    }
    return undefined;
  }

  private async handleWebhook(ctx: Context, next: Next) {
    const workflowKey = ctx.action.params.filterByTk as string;

    if (!workflowKey) {
      ctx.throw(400, 'Workflow key is required');
    }

    const workflow = this.findWorkflowByKey(workflowKey);
    if (!workflow) {
      ctx.throw(404, 'Webhook not found or not enabled');
    }

    const config = (workflow.config || {}) as WebhookConfig;
    const methods = config.methods ?? ['POST'];
    const requestMethod = ctx.method.toUpperCase();

    if (!methods.includes(requestMethod)) {
      ctx.throw(405, 'HTTP method not allowed');
    }

    if (config.secret) {
      const providedSecret = ctx.get('x-webhook-secret') || (ctx.query as Record<string, string>)?.secret;
      if (providedSecret !== config.secret) {
        ctx.throw(401, 'Invalid webhook secret');
      }
    }

    const triggerContext = {
      data: (ctx.request as { body?: unknown })?.body ?? {},
      headers: ctx.headers ?? {},
      query: ctx.query ?? {},
      method: requestMethod,
      params: { key: workflowKey },
    };

    if (workflow.sync) {
      const processor = await this.workflow.trigger(workflow, triggerContext);
      if (processor) {
        const { execution } = processor;
        ctx.body = {
          ok: true,
          status: execution?.status,
          data: execution?.context?.data ?? null,
        };
      } else {
        ctx.body = { ok: true };
      }
      ctx.status = 200;
    } else {
      this.workflow.trigger(workflow, triggerContext);
      ctx.body = {
        ok: true,
        message: 'Webhook received',
      };
      ctx.status = 200;
    }

    await next();
  }

  async execute(workflow: WorkflowModel, values: TriggerValues, options: EventOptions) {
    const context = {
      data: values?.data ?? {},
      headers: {},
      query: {},
      method: 'POST',
      params: { key: workflow.key },
    };
    return this.workflow.trigger(workflow, context, options);
  }

  validateContext(values: TriggerValues) {
    if (values?.data == null) {
      return {
        data: 'Request body data is required',
      };
    }
    return null;
  }
}
