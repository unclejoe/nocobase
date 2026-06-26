/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co, Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { ISchema, observer, useField } from '@formily/react';
import React from 'react';
import auditTrailsCollection from '../../collections/auditTrails';
import { generateNTemplate } from '../../constants';

// Pretty-prints the JSON `metadata` field as read-only in the detail drawer.
const MetadataReadPretty = observer(
  () => {
    const field = useField<any>();
    const value = field?.value;
    let text = '';
    if (value != null) {
      try {
        text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      } catch {
        text = String(value);
      }
    }
    return (
      <pre
        style={{
          margin: 0,
          padding: '8px 12px',
          background: 'rgba(0, 0, 0, 0.04)',
          borderRadius: 4,
          maxHeight: 320,
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </pre>
    );
  },
  { displayName: 'MetadataReadPretty' },
);

export const components = { MetadataReadPretty };

export const auditLogsSchema: ISchema = {
  type: 'object',
  properties: {
    configuration: {
      type: 'void',
      'x-decorator': 'TableBlockProvider',
      'x-decorator-props': {
        collection: auditTrailsCollection,
        resource: 'auditTrails',
        action: 'list',
        params: {
          pageSize: 20,
          sort: ['-createdAt'],
        },
        rowKey: 'id',
        showIndex: false,
      },
      'x-component': 'CardItem',
      properties: {
        actions: {
          type: 'void',
          'x-component': 'ActionBar',
          'x-component-props': {
            style: {
              marginBottom: 'var(--nb-spacing)',
            },
          },
          properties: {
            filter: {
              type: 'void',
              title: '{{ t("Filter") }}',
              'x-action': 'filter',
              'x-component': 'Filter.Action',
              'x-use-component-props': 'useFilterActionProps',
              'x-component-props': {
                icon: 'FilterOutlined',
              },
              'x-align': 'left',
            },
          },
        },
        auditTrailsTable: {
          type: 'array',
          'x-component': 'TableV2',
          'x-use-component-props': 'useTableBlockProps',
          'x-component-props': {
            rowKey: 'id',
          },
          properties: {
            columnCreatedAt: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('Created at'),
              properties: {
                createdAt: {
                  type: 'date',
                  'x-component': 'DatePicker',
                  'x-component-props': {
                    format: 'YYYY-MM-DD HH:mm:ss',
                    showTime: true,
                  },
                  'x-read-pretty': true,
                },
              },
            },
            columnUserId: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('User ID'),
              properties: {
                userId: {
                  type: 'string',
                  'x-component': 'CollectionField',
                  'x-read-pretty': true,
                },
              },
            },
            columnRole: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('Role'),
              properties: {
                roleName: {
                  type: 'string',
                  'x-component': 'CollectionField',
                  'x-read-pretty': true,
                },
              },
            },
            columnResource: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('Resource'),
              properties: {
                resource: {
                  type: 'string',
                  'x-component': 'CollectionField',
                  'x-read-pretty': true,
                },
              },
            },
            columnAction: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('Action'),
              properties: {
                action: {
                  type: 'string',
                  'x-component': 'CollectionField',
                  'x-read-pretty': true,
                },
              },
            },
            columnStatus: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('Status'),
              properties: {
                status: {
                  type: 'string',
                  'x-component': 'CollectionField',
                  'x-read-pretty': true,
                },
              },
            },
            columnIp: {
              type: 'void',
              'x-decorator': 'TableV2.Column.Decorator',
              'x-component': 'TableV2.Column',
              title: generateNTemplate('IP'),
              properties: {
                ip: {
                  type: 'string',
                  'x-component': 'CollectionField',
                  'x-read-pretty': true,
                },
              },
            },
            actionColumn: {
              type: 'void',
              title: '{{ t("Actions") }}',
              'x-action-column': 'actions',
              'x-decorator': 'TableV2.Column.ActionBar',
              'x-component': 'TableV2.Column',
              properties: {
                columnActions: {
                  type: 'void',
                  'x-component': 'Space',
                  'x-component-props': {
                    split: '|',
                  },
                  properties: {
                    view: {
                      type: 'void',
                      title: generateNTemplate('View'),
                      'x-component': 'Action.Link',
                      'x-component-props': {
                        openMode: 'drawer',
                      },
                      properties: {
                        drawer: {
                          type: 'void',
                          title: generateNTemplate('Log detail'),
                          'x-component': 'Action.Container',
                          'x-component-props': {
                            className: 'nb-action-popup',
                          },
                          properties: {
                            grid: {
                              type: 'void',
                              'x-component': 'Grid',
                              properties: {
                                block: {
                                  type: 'void',
                                  'x-component': 'Grid.Row',
                                  properties: {
                                    col: {
                                      type: 'void',
                                      'x-component': 'Grid.Col',
                                      properties: {
                                        detail: {
                                          type: 'void',
                                          'x-acl-action': 'auditTrails:get',
                                          'x-decorator': 'FormBlockProvider',
                                          'x-decorator-props': {
                                            resource: 'auditTrails',
                                            collection: auditTrailsCollection,
                                            readPretty: true,
                                            action: 'get',
                                            useParams: '{{ useParamsFromRecord }}',
                                            useSourceId: '{{ useSourceIdFromParentRecord }}',
                                          },
                                          'x-component': 'CardItem',
                                          properties: {
                                            form: {
                                              type: 'void',
                                              'x-component': 'FormV2',
                                              'x-use-component-props': 'useFormBlockProps',
                                              'x-read-pretty': true,
                                              properties: {
                                                grid: {
                                                  type: 'void',
                                                  'x-component': 'Grid',
                                                  properties: {
                                                    row1: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            uuid: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row2: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            resource: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row3: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            action: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row4: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            userId: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row5: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            roleName: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row6: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            status: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row7: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            ip: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row8: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            ua: {
                                                              type: 'string',
                                                              'x-component': 'CollectionField',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row9: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            metadata: {
                                                              type: 'object',
                                                              'x-component': 'MetadataReadPretty',
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                    row10: {
                                                      type: 'void',
                                                      'x-component': 'Grid.Row',
                                                      properties: {
                                                        col1: {
                                                          type: 'void',
                                                          'x-component': 'Grid.Col',
                                                          properties: {
                                                            createdAt: {
                                                              type: 'date',
                                                              'x-component': 'DatePicker',
                                                              'x-component-props': {
                                                                format: 'YYYY-MM-DD HH:mm:ss',
                                                                showTime: true,
                                                              },
                                                              'x-decorator': 'FormItem',
                                                              'x-read-pretty': true,
                                                            },
                                                          },
                                                        },
                                                      },
                                                    },
                                                  },
                                                },
                                              },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
