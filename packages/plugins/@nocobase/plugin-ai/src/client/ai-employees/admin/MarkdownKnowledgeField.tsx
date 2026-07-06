/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { connect, mapProps } from '@formily/react';
import { useAPIClient } from '@nocobase/client';
import { useGlobalTheme } from '@nocobase/client-v2';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

const supportedLocales = ['en_US', 'fr_FR', 'pt_BR', 'ja_JP', 'ko_KR', 'ru_RU', 'sv_SE', 'zh_CN', 'zh_TW'];

const toolbar = [
  'headings',
  'bold',
  'italic',
  'strike',
  'link',
  'list',
  'ordered-list',
  'check',
  'quote',
  'line',
  'code',
  'inline-code',
  'preview',
  'fullscreen',
];

/**
 * A self-contained Vditor-backed markdown editor used by the AI employee edit
 * form for the `markdownKnowledge` field (Layer 1 static knowledge).
 *
 * Reuses the same `vditor` package already shipped with the platform's
 * `plugin-field-markdown-vditor`. Dark theme is forwarded to vditor so the
 * editor surface (toolbar / borders) blends with the active antd theme —
 * see `docs/dark-mode-theme-guidelines.md`. No neutral colors are hardcoded;
 * the editor chrome is fully driven by vditor's own `dark` / `classic` skin.
 */
export const MarkdownKnowledgeEditor: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const { isDarkTheme } = useGlobalTheme();
  const apiClient = useAPIClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const vdRef = useRef<Vditor | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const lang: string = useMemo(() => {
    const current = (apiClient.auth.locale || 'en-US').replace(/-/g, '_');
    return supportedLocales.includes(current) ? current : 'en_US';
  }, [apiClient.auth.locale]);

  // Vditor loads its own assets (toolbar icons, parsers, KaTeX, etc.) from a
  // CDN. jsDelivr is vditor's default and matches the platform's
  // `plugin-field-markdown-vditor` dev configuration, so the asset set is
  // shared / cached across both call sites.
  const cdn = 'https://cdn.jsdelivr.net/npm/vditor@3.11.2';

  useEffect(() => {
    if (!containerRef.current) return;

    const vditor = new Vditor(containerRef.current, {
      value: value ?? '',
      lang,
      cache: { enable: false },
      undoDelay: 0,
      preview: { math: { engine: 'KaTeX' } },
      toolbar,
      fullscreen: { index: 1200 },
      cdn,
      minHeight: 240,
      mode: 'ir',
      // Vditor ships its own light/dark CSS; pick the one matching the active
      // antd theme so the editor surface blends with dark / compact-dark.
      theme: isDarkTheme ? 'dark' : 'classic',
      after: () => {
        vdRef.current = vditor;
        setEditorReady(true);
        // Prevent the editor from auto-scrolling the drawer into view on init.
        const sx = window.scrollX;
        const sy = window.scrollY;
        vditor.setValue(value ?? '');
        requestAnimationFrame(() => window.scrollTo(sx, sy));
        if (disabled) {
          vditor.disabled();
        } else {
          vditor.enable();
        }
      },
      input(next) {
        onChange?.(next);
      },
    });

    return () => {
      vdRef.current?.destroy();
      vdRef.current = null;
      setEditorReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDarkTheme, lang, cdn]);

  // Keep the editor in sync when the external value changes (e.g. form reset / load).
  useEffect(() => {
    if (!editorReady || !vdRef.current) return;
    const editor = vdRef.current;
    if (value !== editor.getValue()) {
      editor.setValue(value ?? '');
    }
  }, [value, editorReady]);

  // Reflect disabled state changes coming from the form (e.g. switch toggled off).
  useEffect(() => {
    if (!editorReady || !vdRef.current) return;
    if (disabled) {
      vdRef.current.disabled();
    } else {
      vdRef.current.enable();
    }
  }, [disabled, editorReady]);

  return (
    <div style={{ width: '100%' }} ref={containerRef}>
      {/* Vditor mounts its own DOM into this container. */}
    </div>
  );
};

/**
 * Formily-connected field component. Register under the name
 * `MarkdownKnowledgeField` and use as an `x-component` on the
 * `markdownKnowledge` schema property.
 */
export const MarkdownKnowledgeField = connect(
  MarkdownKnowledgeEditor,
  mapProps((props) => props),
);
