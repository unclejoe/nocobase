/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin } from '@nocobase/client-v2';
import { AIConfigRepository } from './repositories/AIConfigRepository';
import { AIPluginFeatureManagerImpl } from './manager/ai-feature-manager';

type AIFlowContext = {
  aiConfigRepository?: AIConfigRepository;
  defineProperty: (name: string, descriptor: { value: unknown }) => void;
};

export class PluginAIClientV2 extends Plugin {
  features = new AIPluginFeatureManagerImpl();

  async load() {
    const context = this.app.flowEngine.context as AIFlowContext;
    if (!context.aiConfigRepository) {
      context.defineProperty('aiConfigRepository', {
        value: new AIConfigRepository(this.app.apiClient),
      });
    }

    // Register a v2 plugin-settings page that exposes the Layer 1 markdown
    // knowledge editor. The v2 runtime has no AI employee admin/edit page yet
    // (the full formily form lives in v1), so this page gives v2 users a
    // usable markdown knowledge entry — mirroring the pattern in plugin-acl's
    // RolesManagementPage (addMenuItem + addPageTabItem + componentLoader).
    this.pluginSettingsManager.addMenuItem({
      key: 'ai-markdown-knowledge',
      title: this.t('Markdown Knowledge'),
      isPinned: false,
      sort: 500,
      icon: 'FileTextOutlined',
    });
    this.pluginSettingsManager.addPageTabItem({
      menuKey: 'ai-markdown-knowledge',
      key: 'index',
      title: this.t('Markdown Knowledge'),
      componentLoader: () => import('./ai-employees/admin/MarkdownKnowledgePage'),
    });
  }
}

export default PluginAIClientV2;

export { AIEmployeeProfileCard } from './ai-employees/ProfileCard';
export { AIEmployeeShortcut } from './ai-employees/AIEmployeeShortcut';
export { avatars, avatarsMap } from './ai-employees/avatars';
// Layer 1 markdown knowledge editor (v2 runtime) — see admin/MarkdownKnowledgeEditor.
export { MarkdownKnowledgeEditor } from './ai-employees/admin/MarkdownKnowledgeEditor';
export { MarkdownKnowledgeVditorField } from './ai-employees/admin/MarkdownKnowledgeVditorField';
export type {
  AIEmployee,
  Attachment,
  ChatEditorRef,
  ContextItem,
  Conversation,
  Message,
  SkillSettings,
  Task,
  TriggerTaskOptions,
  WebSearching,
} from './ai-employees/types';
export { formatModelLabel } from './llm-services/model-label';
export { AIConfigRepository } from './repositories/AIConfigRepository';
export { AIPluginFeatureManagerImpl } from './manager/ai-feature-manager';
export * from './features';
export { defaultVectorStorePropForm } from './features/components';
export { useAIConfigRepository } from './repositories/hooks/useAIConfigRepository';
export { useChatMessagesStore } from './ai-employees/chatbox/stores/chat-messages';
export { useChatBoxStore } from './ai-employees/chatbox/stores/chat-box';
export { useChatConversationsStore } from './ai-employees/chatbox/stores/chat-conversations';
export { useChatBoxActions } from './ai-employees/chatbox/hooks/useChatBoxActions';
