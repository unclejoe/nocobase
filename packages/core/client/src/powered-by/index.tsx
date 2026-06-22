/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { css, cx } from '@emotion/css';
import { parseHTML } from '@nocobase/utils/client';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAPIClient } from '../api-client';
import { useCurrentAppInfo } from '../appInfo/CurrentAppInfoProvider';
import { usePlugin } from '../application';
import { useToken } from '../style';

export const PoweredBy = () => {
  const { i18n } = useTranslation();
  const { token } = useToken();
  const customBrandPlugin: any = usePlugin('@nocobase/plugin-custom-brand');
  const data = useCurrentAppInfo();
  const apiClient = useAPIClient();
  const urls = {
    'en-US': 'https://www.nocobase.com',
    'zh-CN': 'https://www.nocobase.com/cn/',
  };
  const style = css`
    text-align: center;
    color: ${token.colorTextDescription};
    a {
      color: ${token.colorTextDescription};
      &:hover {
        color: ${token.colorText};
      }
    }
  `;
  const appVersion = `<span class="nb-app-version">v${data?.data?.version}</span>`;

  // The signin page (AuthLayout) does not mount CurrentAppInfoProvider, so
  // `data` is null there and the env brand would never reach the footer.
  // Fetch app:getInfo directly as a fallback so the footer stays brandable.
  const [fallbackBrand, setFallbackBrand] = useState<{ title?: string; homepageUrl?: string } | undefined>();
  useEffect(() => {
    if (data || fallbackBrand) {
      return;
    }
    let active = true;
    apiClient
      .request({ url: 'app:getInfo' })
      .then((res: any) => {
        if (active) {
          setFallbackBrand(res.data?.data?.brand);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [data, fallbackBrand, apiClient]);

  // Resolution order (see BRAND_INVENTORY.md §1): env-driven brand (set via
  // `APP_BRAND_*` env vars, surfaced through `app:getInfo`) wins; otherwise the
  // `@nocobase/plugin-custom-brand` plugin's `brand` HTML template; otherwise the
  // hardcoded "Powered by NocoBase" default.
  const envBrand = data?.data?.brand || fallbackBrand;
  const envBrandTitle = envBrand?.title;
  const envBrandHtml =
    envBrandTitle || envBrand?.homepageUrl
      ? `Powered by <a href="${envBrand?.homepageUrl || urls[i18n.language] || urls['en-US']}" target="_blank">${
          envBrandTitle || 'NocoBase'
        }</a>`
      : null;

  return (
    <div
      className={cx(style, 'nb-brand')}
      dangerouslySetInnerHTML={{
        __html: parseHTML(
          envBrandHtml ||
            customBrandPlugin?.options?.options?.brand ||
            `Powered by <a href="${urls[i18n.language] || urls['en-US']}" target="_blank">NocoBase</a>`,
          { appVersion },
        ),
      }}
    ></div>
  );
};
