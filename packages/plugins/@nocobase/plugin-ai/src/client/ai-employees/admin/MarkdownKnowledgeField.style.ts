/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { genStyleHook } from '@nocobase/client';

/**
 * Token-driven style overlay for the AI-employee markdown-knowledge editor.
 *
 * vditor ships its own light/dark skin (selected via the `theme` option in
 * `MarkdownKnowledgeField.tsx`) which drives the editor chrome (toolbar /
 * borders). Its IR content area (`pre.vditor-reset`), however, uses a fixed
 * `--panel-background-color` and inherits text color — neither follows antd's
 * theme tokens, so in dark / compact-dark the content area rendered as a white
 * slab with dark text, unreadable inside the surrounding dark drawer.
 *
 * This overlay nails the content-area background to `token.colorBgContainer`
 * and lets text color resolve to antd's token-driven value, matching what the
 * platform's `plugin-field-markdown-vditor` does for the same vditor surface.
 * See `docs/dark-mode-theme-guidelines.md` — no neutral colors are hardcoded.
 */
export default genStyleHook('nb-ai-employee-markdown-knowledge', (token) => {
  const { componentCls } = token;

  return {
    [componentCls]: {
      position: 'relative',
      overflow: 'visible',
      '.vditor': { borderRadius: 8, overflow: 'visible' },
      '.vditor .vditor-content': { borderRadius: '0 0 8px 8px', overflow: 'hidden' },
      '.vditor .vditor-toolbar': {
        position: 'relative',
        overflow: 'visible',
        paddingLeft: '16px !important',
        borderRadius: '8px 8px 0 0',
      },
      // Text color resolves to antd's token-computed color so it stays readable
      // in every theme; padding matches the platform markdown-vditor field.
      '.vditor-reset': { fontSize: `${token.fontSize}px !important`, color: 'unset', padding: '10px !important' },
      '.vditor .vditor-content .vditor-ir .vditor-reset': { paddingLeft: '16px !important' },
      // Core fix: IR content-area background follows the active theme token
      // instead of vditor's fixed --panel-background-color.
      '.vditor-ir pre.vditor-reset': {
        backgroundColor: `${token.colorBgContainer} !important`,
      },
    },
  };
});
