/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * Shared i18n helpers for the approval plugin (used by both v1 and v2 client).
 */

import { useTranslation } from 'react-i18next';
import { NAMESPACE } from '../common/constants';

export { NAMESPACE };

export function usePluginTranslation(options?) {
  return useTranslation(NAMESPACE, options);
}

/** Resolve a key to the i18n template string used in schemas. */
export function lang(key: string): string {
  return `{{t("${key}", { ns: "${NAMESPACE}" })}}`;
}
