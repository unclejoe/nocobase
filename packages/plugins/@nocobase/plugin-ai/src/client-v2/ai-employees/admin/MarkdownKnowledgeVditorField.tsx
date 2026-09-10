/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { useGlobalTheme } from '@nocobase/client-v2';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';

const supportedLocales = ['en_US', 'fr_FR', 'pt_BR', 'ja_JP', 'ko_KR', 'ru_RU', 'sv_SE', 'zh_CN', 'zh_TW'] as const;

type VditorLang = (typeof supportedLocales)[number];

// vditor's IOptions.lang is `keyof II18n` (a literal union), so the normalized locale must be
// narrowed to that union instead of passing a plain string.
const isVditorLang = (value: string): value is VditorLang => (supportedLocales as readonly string[]).includes(value);

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
 * v2-runtime markdown editor for the AI employee Layer 1 `markdownKnowledge`
 * field.
 *
 * Reuses the same `vditor` package already shipped with the platform's
 * `plugin-field-markdown-vditor`. Follows the v2 component convention
 * (plain React + `@nocobase/client-v2`'s `useGlobalTheme`, not formily). The
 * dark theme is forwarded to vditor so the editor chrome blends with dark /
 * compact-dark antd themes — see `docs/dark-mode-theme-guidelines.md`. No
 * neutral colors are hardcoded; the editor surface is fully driven by
 * vditor's own `dark` / `classic` skin.
 *
 * The component is value/onChange-controlled so it can be dropped into an
 * antd `<Form.Item name="markdownKnowledge">` (which injects those props) or
 * used standalone.
 */
export const MarkdownKnowledgeVditorField: React.FC<{
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  locale?: string;
}> = ({ value, onChange, disabled, locale }) => {
  const { isDarkTheme } = useGlobalTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const vdRef = useRef<Vditor | null>(null);
  const [editorReady, setEditorReady] = useState(false);

  const lang = useMemo<VditorLang>(() => {
    const current = (locale || 'en-US').replace(/-/g, '_');
    return isVditorLang(current) ? current : 'en_US';
  }, [locale]);

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

  useEffect(() => {
    if (!editorReady || !vdRef.current) return;
    const editor = vdRef.current;
    if (value !== editor.getValue()) {
      editor.setValue(value ?? '');
    }
  }, [value, editorReady]);

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

export default MarkdownKnowledgeVditorField;
