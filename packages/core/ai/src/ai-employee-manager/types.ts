/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

export type AIEmployeeLocalizedProfile = {
  avatar?: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  about?: string;
};

export type AIEmployeeKnowledgeBase = {
  topK: number;
  score: string;
  knowledgeBaseIds: string[];
};

export type AIEmployeeToolSetting = {
  name: string;
  autoCall?: boolean;
};

export type AIEmployeeOptions = {
  username: string;
  category?: string;
  description?: string;
  skills?: string[];
  tools?: AIEmployeeToolSetting[];
  /**
   * Whether web search is enabled by default for this employee. When omitted,
   * the caller's request-level `webSearch` flag controls availability. Set to
   * `true` for research-oriented employees whose core role requires internet
   * access (e.g. `vera`).
   */
  webSearch?: boolean;
  chatSettings?: {
    systemPromptMode?: 'default' | 'raw' | 'none';
    enableSkills?: boolean;
    enableTools?: boolean;
    [key: string]: unknown;
  };
  avatar?: string;
  nickname?: string;
  position?: string;
  bio?: string;
  greeting?: string;
  systemPrompt?: string | null;
  sort?: number;
};

export type AIEmployeeEntry = Omit<AIEmployeeOptions, 'skills' | 'tools' | 'systemPrompt'> & {
  about?: string;
  defaultPrompt?: string;
  skillSettings: {
    skills: string[];
    tools: AIEmployeeToolSetting[];
  };
  chatSettings?: AIEmployeeOptions['chatSettings'];
};

export type AIEmployeeFilter = {
  builtIn?: boolean;
  username?: string;
};

export interface AIEmployeeManager {
  init(): Promise<void>;
  getEmployee(username: string): Promise<AIEmployeeEntry>;
  /**
   * Returns the registered source definition (e.g. `webSearch` default) for a
   * built-in employee, or `undefined` for user-created employees.
   */
  getEmployeeOptions(username: string): AIEmployeeOptions | undefined;
  listEmployees(filter?: AIEmployeeFilter): Promise<AIEmployeeEntry[]>;
  registerEmployee(options: AIEmployeeOptions): Promise<void>;
}
