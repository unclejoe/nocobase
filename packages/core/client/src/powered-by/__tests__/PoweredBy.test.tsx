/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CurrentAppInfoProvider, PoweredBy } from '@nocobase/client';
import { renderAppOptions, screen, waitFor } from '@nocobase/test/client';
import React from 'react';

// v1 PoweredBy brand resolution regression. Mirrors the v2 PoweredBy.test.tsx
// contract: env-driven brand (app:getInfo `brand`) > plugin-custom-brand >
// hardcoded "Powered by Dan.AI" fork default. See BRAND_INVENTORY.md §1.
describe('PoweredBy (v1)', () => {
  const renderPoweredBy = async (appGetInfoData: Record<string, any> = {}) => {
    const Root = () => (
      <CurrentAppInfoProvider>
        <PoweredBy />
      </CurrentAppInfoProvider>
    );

    return renderAppOptions({
      noWrapperSchema: true,
      appOptions: {
        providers: [Root],
      },
      apis: {
        'app:getInfo': {
          data: { version: '1.2.3', lang: 'en-US', ...appGetInfoData },
        },
      },
    });
  };

  it('renders the default "Powered by Dan.AI" when no brand override is set', async () => {
    const { container } = await renderPoweredBy();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Dan.AI' })).toHaveAttribute('href', 'https://dan.ai');
    });
    expect(container).toHaveTextContent('Powered by Dan.AI');
  });

  it('renders the env-driven brand (APP_BRAND_*) when app:getInfo provides it', async () => {
    const { container } = await renderPoweredBy({
      brand: { title: 'MyApp', homepageUrl: 'https://myapp.example.com' },
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'MyApp' })).toHaveAttribute('href', 'https://myapp.example.com');
    });
    expect(container).toHaveTextContent('Powered by MyApp');
  });

  it('falls back to the default homepage URL when only the env brand title is set', async () => {
    const { container } = await renderPoweredBy({
      brand: { title: 'TitleOnly' },
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'TitleOnly' })).toHaveAttribute('href', 'https://dan.ai');
    });
    expect(container).toHaveTextContent('Powered by TitleOnly');
  });
});
