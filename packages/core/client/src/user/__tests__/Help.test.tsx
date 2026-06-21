/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { CurrentAppInfoProvider } from '@nocobase/client';
import { renderAppOptions, screen, waitFor } from '@nocobase/test/client';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { Help } from '../Help';

// v1 Help brand resolution regression (BRAND.md §6 slice 2). The Help menu
// header product name and the Home/Handbook/License links must read from
// appInfo.brand (set via APP_BRAND_* env vars) and fall back to the hardcoded
// NocoBase defaults when absent. The Dropdown renders its menu into a portal on
// document.body, so assertions use `screen` (whole-document) queries, not the
// render container. See BRAND_INVENTORY.md §2.1 (rows v1-1..v1-5).
describe('Help (v1) brand resolution', () => {
  const renderHelp = async (appGetInfoData: Record<string, any> = {}) => {
    const user = userEvent.setup();
    const Root = () => (
      <CurrentAppInfoProvider>
        <Help />
      </CurrentAppInfoProvider>
    );

    renderAppOptions({
      noWrapperSchema: true,
      appOptions: {
        providers: [Root],
      },
      apis: {
        'app:getInfo': {
          data: { version: '2.1.9', lang: 'en-US', ...appGetInfoData },
        },
      },
    });

    // Open the help dropdown so the menu items render into the DOM portal.
    await waitFor(() => {
      expect(screen.getByTestId('help-button')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('help-button'));
    // The menu renders asynchronously into document.body after the click.
    await waitFor(() => {
      expect(screen.getByText('Home page')).toBeInTheDocument();
    });
  };

  it('renders the default NocoBase header and nocobase.com links when no brand override is set', async () => {
    await renderHelp();

    // Header shows the default product name.
    await waitFor(() => {
      expect(screen.getByText('NocoBase')).toBeInTheDocument();
    });
    // Default links point at nocobase.com / docs.nocobase.com.
    expect(screen.getByText('Home page').closest('a')).toHaveAttribute('href', 'https://www.nocobase.com');
    expect(screen.getByText('Handbook').closest('a')).toHaveAttribute('href', 'https://docs.nocobase.com/guide/');
    expect(screen.getByText('License').closest('a')).toHaveAttribute('href', 'https://www.nocobase.com/en/agreement');
  });

  it('renders the env-driven brand header and links when app:getInfo provides them', async () => {
    await renderHelp({
      brand: {
        title: 'Acme',
        homepageUrl: 'https://acme.example.com',
        docsUrl: 'https://docs.acme.example.com',
        agreementUrl: 'https://acme.example.com/agreement',
      },
    });

    // The header product name reflects the env brand title; no NocoBase residual.
    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(screen.queryByText('NocoBase')).not.toBeInTheDocument();

    // All three links point at the env-provided URLs, not nocobase.com.
    expect(screen.getByText('Home page').closest('a')).toHaveAttribute('href', 'https://acme.example.com');
    expect(screen.getByText('Handbook').closest('a')).toHaveAttribute('href', 'https://docs.acme.example.com');
    expect(screen.getByText('License').closest('a')).toHaveAttribute('href', 'https://acme.example.com/agreement');
  });

  it('falls back per-link to defaults when only some brand URLs are set', async () => {
    // APP_BRAND_TITLE + APP_BRAND_HOMEPAGE_URL set, but docs/agreement unset:
    // those links keep their nocobase.com defaults.
    await renderHelp({
      brand: { title: 'Acme', homepageUrl: 'https://acme.example.com' },
    });

    await waitFor(() => {
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });
    expect(screen.getByText('Home page').closest('a')).toHaveAttribute('href', 'https://acme.example.com');
    expect(screen.getByText('Handbook').closest('a')).toHaveAttribute('href', 'https://docs.nocobase.com/guide/');
    expect(screen.getByText('License').closest('a')).toHaveAttribute('href', 'https://www.nocobase.com/en/agreement');
  });
});
