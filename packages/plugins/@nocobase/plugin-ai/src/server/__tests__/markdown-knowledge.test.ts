/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { describe, expect, it } from 'vitest';
import {
  getSystemPrompt,
  applyMarkdownKnowledgeTokenBudget,
  estimateTokens,
  MARKDOWN_KNOWLEDGE_TOKEN_BUDGET,
} from '../ai-employees/prompts';

const baseArgs = {
  aiEmployee: { nickname: 'TestBot', about: 'You are a helpful test bot.' },
  task: { background: '' },
  environment: { database: 'postgres', locale: 'en-US' },
};

describe('markdownKnowledge token budget', () => {
  it('estimates tokens via the ~4 chars/token heuristic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('leaves short content untouched', () => {
    const result = applyMarkdownKnowledgeTokenBudget('# Rule\n\nBe concise.');
    expect(result.truncated).toBe(false);
    expect(result.content).toBe('# Rule\n\nBe concise.');
  });

  it('truncates content above the budget and flags it', () => {
    // Build a string that comfortably exceeds the default 8k token budget.
    const oversized = 'a'.repeat(MARKDOWN_KNOWLEDGE_TOKEN_BUDGET * 4 + 1000);
    const result = applyMarkdownKnowledgeTokenBudget(oversized);
    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThan(oversized.length);
    expect(result.content).toContain('[markdownKnowledge truncated: exceeded token budget]');
    // Truncated content should fit roughly within the budget (allowing a small
    // margin for the truncation marker appended to the body).
    expect(estimateTokens(result.content)).toBeLessThanOrEqual(MARKDOWN_KNOWLEDGE_TOKEN_BUDGET + 50);
  });

  it('respects a custom budget', () => {
    const result = applyMarkdownKnowledgeTokenBudget('a'.repeat(1000), 10);
    expect(result.truncated).toBe(true);
  });
});

describe('getSystemPrompt markdownKnowledge injection', () => {
  it('injects a <markdownKnowledge> block when content is provided', () => {
    const prompt = getSystemPrompt({
      ...baseArgs,
      markdownKnowledge: '# SOP\n1. Always greet the user.',
    });
    expect(prompt).toContain('<markdownKnowledge>');
    expect(prompt).toContain('</markdownKnowledge>');
    expect(prompt).toContain('# SOP\n1. Always greet the user.');
  });

  it('omits the <markdownKnowledge> block when content is absent (disabled)', () => {
    const prompt = getSystemPrompt({ ...baseArgs });
    expect(prompt).not.toContain('<markdownKnowledge>');
    expect(prompt).not.toContain('</markdownKnowledge>');
  });

  it('omits the block when an empty string is passed', () => {
    const prompt = getSystemPrompt({ ...baseArgs, markdownKnowledge: '' });
    expect(prompt).not.toContain('<markdownKnowledge>');
  });

  it('renders <markdownKnowledge> alongside <knowledgeBase>', () => {
    const prompt = getSystemPrompt({
      ...baseArgs,
      knowledgeBase: 'retrieved doc',
      markdownKnowledge: '# Rule',
    });
    expect(prompt).toContain('<knowledgeBase>retrieved doc</knowledgeBase>');
    expect(prompt).toContain('<markdownKnowledge>');
    expect(prompt).toContain('</markdownKnowledge>');
  });

  it('reflects truncated content in the rendered block', () => {
    const oversized = 'b'.repeat(MARKDOWN_KNOWLEDGE_TOKEN_BUDGET * 4 + 500);
    const { content } = applyMarkdownKnowledgeTokenBudget(oversized);
    const prompt = getSystemPrompt({
      ...baseArgs,
      markdownKnowledge: content,
    });
    expect(prompt).toContain('[markdownKnowledge truncated: exceeded token budget]');
    expect(estimateTokens(prompt)).toBeLessThanOrEqual(
      // The base prompt has some overhead; the markdown block alone must obey
      // the budget, but the full prompt is allowed to be a little larger.
      MARKDOWN_KNOWLEDGE_TOKEN_BUDGET * 4 + 4000,
    );
  });
});
