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
import { theme } from 'antd';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentAppInfo } from '../hooks/useCurrentAppInfo';
import { usePlugin } from '../hooks/usePlugin';
import { getAppVersionHTML } from '../utils/appVersionHTML';

const homePageUrls: Record<string, string> = {
  'en-US': 'https://www.nocobase.com',
  'zh-CN': 'https://www.nocobase.com/cn/',
};

/**
 * Footer brand rendered on auth pages and other layout entry points.
 *
 * Resolution order (see BRAND_INVENTORY.md §1): env-driven `appInfo.brand`
 * (set via `APP_BRAND_*` env vars, surfaced through `app:getInfo`) wins;
 * otherwise the `@nocobase/plugin-custom-brand` plugin's `brand` HTML template;
 * otherwise the hardcoded "Powered by NocoBase" default.
 *
 * The custom-brand branch keeps the `.nb-brand` className so the plugin's
 * stylesheet can target it; the env/default branches do not, matching the
 * contract pinned by PoweredBy.test.tsx. The version is escaped via
 * `getAppVersionHTML` so a malicious app version cannot inject script tags.
 */
export function PoweredBy() {
  const { i18n } = useTranslation();
  const { token } = theme.useToken();
  const customBrandPlugin: any = usePlugin('@nocobase/plugin-custom-brand');
  const appInfo = useCurrentAppInfo();
  const appVersion = getAppVersionHTML(appInfo?.version);
  const brandStyle = css`
    text-align: center;
    color: ${token.colorTextDescription};
    a {
      color: ${token.colorTextDescription};
      &:hover {
        color: ${token.colorText};
      }
    }
  `;
  const customBrand = customBrandPlugin?.options?.options?.brand;

  // Resolution order (see BRAND_INVENTORY.md §1): env-driven brand wins;
  // otherwise the plugin; otherwise the default. The env tier must be checked
  // before the plugin tier so an operator-set APP_BRAND_TITLE overrides an
  // installed @nocobase/plugin-custom-brand.
  const envBrand = appInfo?.brand;
  if (envBrand?.title || envBrand?.homepageUrl) {
    const brandTitle = envBrand.title || 'NocoBase';
    const homePage = envBrand.homepageUrl || homePageUrls[i18n.language] || homePageUrls['en-US'];

    return (
      <div className={brandStyle}>
        Powered by{' '}
        <a href={homePage} target="_blank" rel="noreferrer">
          {brandTitle}
        </a>
      </div>
    );
  }

  if (customBrand) {
    return (
      <div
        className={cx(brandStyle, 'nb-brand')}
        dangerouslySetInnerHTML={{
          __html: parseHTML(customBrand, { appVersion }),
        }}
      />
    );
  }

  const homePage = homePageUrls[i18n.language] || homePageUrls['en-US'];

  return (
    <div className={brandStyle}>
      Powered by{' '}
      <a href={homePage} target="_blank" rel="noreferrer">
        NocoBase
      </a>
    </div>
  );
}

export default PoweredBy;
