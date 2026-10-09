/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { css, keyframes } from '@emotion/css';
import { PoweredBy, SwitchLanguage, useAPIClient, useRequest, useToken } from '@nocobase/client';
import { ConfigProvider, Spin, theme as antdTheme } from 'antd';
import React, { FC } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthenticatorsContext } from '../authenticator';
import { StudioGlassBackground } from '../components/StudioGlassBackground';
import { useAuthTranslation } from '../locale';

export const AuthenticatorsContextProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
  const api = useAPIClient();
  const {
    data: authenticators = [],
    error,
    loading,
  } = useRequest(() =>
    api
      .resource('authenticators')
      .publicList()
      .then((res) => {
        return res?.data?.data || [];
      }),
  );

  if (loading) {
    return (
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <Spin />
      </div>
    );
  }

  if (error) {
    throw error;
  }

  return <AuthenticatorsContext.Provider value={authenticators as any}>{children}</AuthenticatorsContext.Provider>;
};

// slow left-right drift of the gradient inside the headline glyphs
const sloganShift = keyframes`
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
`;

export function AuthLayout() {
  const { token } = useToken();
  const { t: tAuth } = useAuthTranslation();
  return (
    <div
      className={css`
        position: relative;
        min-height: 100vh;
      `}
    >
      {/* The studio-glass artwork is a fixed light scene, so the auth stage is pinned to the light
          antd algorithm to keep the form controls and footer readable on the glass card even when
          the signed-in UI runs a dark theme. */}
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm }}>
        <StudioGlassBackground />
        <div
          style={{
            position: 'fixed',
            top: '2em',
            left: '2em',
            zIndex: 2,
          }}
        >
          <SwitchLanguage />
        </div>
        <div
          className={css`
            position: fixed;
            top: 1.4em;
            right: 2em;
            z-index: 2;
            text-align: right;
          `}
        >
          <div
            className={css`
              font-size: 24px;
              font-weight: 700;
              letter-spacing: 6px;
              color: ${token.colorTextHeading};
            `}
          >
            {tAuth('Star Voyager')}
          </div>
          <div
            className={css`
              margin-top: 4px;
              font-size: 15px;
              letter-spacing: 3px;
              color: ${token.colorText};
            `}
          >
            {tAuth('AI product suite')}
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            // the compact card sits between the centered mascot and the bottom headline; the
            // mascot is height-capped in the shader, so plain vh keeps them clear of each other
            paddingTop: '56vh',
            paddingBottom: '7vh',
            paddingInline: 24,
          }}
        >
          <div
            className={css`
              width: 100%;
              max-width: 300px;
              padding: 16px 16px 14px;
              border-radius: ${token.borderRadiusLG + 12}px;
              background: rgba(255, 255, 255, 0.42);
              backdrop-filter: blur(28px) saturate(1.5);
              -webkit-backdrop-filter: blur(28px) saturate(1.5);
              border: 1px solid rgba(255, 255, 255, 0.65);
              box-shadow:
                0 24px 60px rgba(84, 78, 118, 0.18),
                0 2px 8px rgba(84, 78, 118, 0.08),
                inset 0 1px 0 rgba(255, 255, 255, 0.85);
            `}
          >
            <AuthenticatorsContextProvider>
              <Outlet />
            </AuthenticatorsContextProvider>
          </div>
          <div
            className={css`
              margin-top: 20px;
              text-align: center;
              font-size: clamp(24px, 2.6vw, 36px);
              font-weight: 700;
              letter-spacing: 1px;
              line-height: 1.4;
              /* gradient text echoing the mascot's glass ramp; deepened for contrast on the
                 light studio backdrop */
              background-image: linear-gradient(100deg, #b8860b 0%, #e0661f 32%, #d92c7f 64%, #7a2ee0 100%);
              background-size: 200% 100%;
              -webkit-background-clip: text;
              background-clip: text;
              color: transparent;
              animation: ${sloganShift} 9s ease-in-out infinite;
              @media (prefers-reduced-motion: reduce) {
                animation: none;
              }
            `}
          >
            <div>{tAuth('Your dedicated AI employee')}</div>
            <div>{tAuth('Build your own business foundation')}</div>
          </div>
        </div>
        <div
          className={css`
            position: absolute;
            bottom: 0;
            width: 100%;
            left: 0;
            z-index: 1;
            text-align: center;
            padding-bottom: 24px;
          `}
        >
          <PoweredBy />
        </div>
      </ConfigProvider>
    </div>
  );
}
