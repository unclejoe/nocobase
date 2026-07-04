/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { getSystemPrompt } from '../ai-employees/prompts';

const baseArgs = {
  aiEmployee: { nickname: 'Atlas', about: 'coordinator' },
  task: { background: 'background text' },
  environment: { database: 'postgres', locale: 'en-US' },
};

describe('getSystemPrompt current-user block', () => {
  it('renders the <user> block with id, username, nickname, and roles when user is provided', () => {
    const prompt = getSystemPrompt({
      ...baseArgs,
      user: { id: 42, username: 'alice', nickname: 'Alice', roles: ['admin', 'member'] },
    });

    expect(prompt).to.include('<user>');
    expect(prompt).to.include('- id: 42');
    expect(prompt).to.include('- username: alice');
    expect(prompt).to.include('- nickname: Alice');
    expect(prompt).to.include('- roles: admin, member');
  });

  it('omits username/nickname/roles lines when those fields are absent', () => {
    const prompt = getSystemPrompt({
      ...baseArgs,
      user: { id: 7 },
    });

    expect(prompt).to.include('- id: 7');
    expect(prompt).to.not.include('- username:');
    expect(prompt).to.not.include('- nickname:');
    expect(prompt).to.not.include('- roles:');
  });

  it('renders no <user> block at all when user is not provided (preserves prior behavior)', () => {
    const prompt = getSystemPrompt(baseArgs);

    expect(prompt).to.not.include('<user>');
  });
});
