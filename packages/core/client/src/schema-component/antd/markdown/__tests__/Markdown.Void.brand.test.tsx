/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CurrentAppInfoContext } from '@nocobase/client';
import { render } from '@nocobase/test/client';
import React from 'react';

import { MarkdownEditor } from '../Markdown.Void';

// Markdown.Void syntax-reference brand regression (BRAND.md §6 slice 3). The
// "Syntax references: Handlebars.js" link previously hardcoded
// https://docs.nocobase.com/handbook/template-handlebars. It now resolves from
// appInfo.brand.docsUrl (set via APP_BRAND_DOCS_URL) with the locale-aware
// nocobase.com default as fallback. See BRAND_INVENTORY.md §2.1 row v1-12.
//
// MarkdownEditor reads `useCurrentAppInfo()` which is a plain useContext on
// CurrentAppInfoContext, so we provide the context value directly (isolated
// unit test — no app/request harness needed).
describe('Markdown.Void syntax-reference brand resolution', () => {
  const renderEditor = (appInfoData: Record<string, any> = {}) => {
    return render(
      <CurrentAppInfoContext.Provider value={{ data: { version: '2.1.9', lang: 'en-US', ...appInfoData } }}>
        <MarkdownEditor scope={[]} defaultValue="" />
      </CurrentAppInfoContext.Provider>,
    );
  };

  it('renders the default docs.nocobase.com link when no brand override is set', () => {
    const { container } = renderEditor();

    const link = container.querySelector('a[href*="template-handlebars"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://docs.nocobase.com/handbook/template-handlebars');
    expect(link.textContent).toBe('Handlebars.js');
  });

  it('renders the env-driven docs URL when appInfo provides brand.docsUrl', () => {
    const { container } = renderEditor({
      brand: { docsUrl: 'https://docs.acme.example.com/template-handlebars' },
    });

    const link = container.querySelector('a[href*="template-handlebars"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('https://docs.acme.example.com/template-handlebars');
    // No nocobase.com residual in the rendered link.
    expect(link.getAttribute('href')).not.toContain('nocobase.com');
  });
});
