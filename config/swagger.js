import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Guardian 智能守护系统 API',
      version: '1.0.0',
      description: '智能守护系统后端API接口文档，提供用户认证、守护圈管理、设备管理、告警处理等功能',
      contact: {
        name: 'Guardian Team',
        email: 'support@guardian.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:10018',
        description: '开发环境服务器'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '请在此处输入JWT令牌，格式：Bearer <token>'
        },
        deviceAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Device-SN',
          description: '设备认证，格式：Device-SN <设备序列号>'
        }
      },
      parameters: {
        deviceType: {
          name: 'deviceType',
          in: 'query',
          description: '设备类型，用于区分不同终端（必需参数）',
          required: true,
          schema: {
            type: 'string',
            enum: ['web', 'mobile', 'desktop'],
            default: 'web'
          }
        },
        circleId: {
          name: 'circleId',
          in: 'path',
          required: true,
          schema: {
            type: 'integer',
            minimum: 1
          },
          description: '守护圈ID'
        },
        page: {
          name: 'page',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 1,
            default: 1
          },
          description: '页码，从1开始'
        },
        limit: {
          name: 'limit',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 20
          },
          description: '每页数量，最大100条'
        }
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            code: {
              type: 'integer',
              description: 'HTTP状态码'
            },
            message: {
              type: 'string',
              description: '响应消息'
            },
            data: {
              description: '响应数据，根据接口不同而变化'
            },
            error: {
              type: 'string',
              nullable: true,
              description: '错误信息，成功时为null'
            }
          },
          required: ['code', 'message', 'data', 'error']
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '用户ID'
            },
            username: {
              type: 'string',
              description: '用户名'
            },
            email: {
              type: 'string',
              format: 'email',
              description: '邮箱地址'
            },
            role: {
              type: 'integer',
              enum: [1, 2, 3],
              description: '用户角色：1-普通用户，2-管理员，3-超级管理员'
            }
          }
        },
        Circle: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '守护圈ID'
            },
            circle_name: {
              type: 'string',
              description: '守护圈名称'
            },
            description: {
              type: 'string',
              description: '守护圈描述'
            },
            circle_code: {
              type: 'string',
              pattern: '^[A-Z0-9]{6}$',
              description: '6位邀请码，用于加入守护圈'
            },
            creator_uid: {
              type: 'integer',
              description: '创建者用户ID'
            },
            member_count: {
              type: 'integer',
              description: '成员数量'
            },
            device_count: {
              type: 'integer',
              description: '设备数量'
            }
          }
        },
        Device: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '设备ID'
            },
            device_sn: {
              type: 'string',
              description: '设备序列号'
            },
            device_name: {
              type: 'string',
              description: '设备名称'
            },
            device_model: {
              type: 'string',
              description: '设备型号'
            },
            circle_id: {
              type: 'integer',
              description: '所属守护圈ID'
            },
            status: {
              type: 'integer',
              enum: [0, 1, 2],
              description: '设备状态：0-离线，1-在线，2-故障'
            }
          }
        },
        Alert: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: '告警ID'
            },
            alert_level: {
              type: 'integer',
              enum: [1, 2, 3, 4],
              description: '告警级别：1-信息，2-警告，3-错误，4-严重'
            },
            alert_content: {
              type: 'string',
              description: '告警内容'
            },
            status: {
              type: 'integer',
              enum: [0, 1, 2, 3],
              description: '处理状态：0-待处理，1-已通知，2-已确认，3-已忽略'
            },
            circle_id: {
              type: 'integer',
              description: '所属守护圈ID'
            },
            create_time: {
              type: 'string',
              format: 'date-time',
              description: '创建时间'
            }
          }
        }
      }
    },
    tags: [
      {
        name: '认证管理',
        description: '用户登录、注册、权限验证相关接口'
      },
      {
        name: '用户管理',
        description: '用户信息查询和管理相关接口'
      },
      {
        name: '邮箱验证',
        description: '邮箱验证码发送和验证相关接口'
      },
      {
        name: '守护圈管理',
        description: '守护圈的创建、查询、更新、删除等管理功能'
      },
      {
        name: '成员管理',
        description: '守护圈成员的加入、退出、权限管理等功能'
      },
      {
        name: '设备管理',
        description: '硬件设备的绑定、解绑、状态管理等功能'
      },
      {
        name: '智能设备',
        description: '第三方智能家居设备的集成和管理'
      },
      {
        name: '事件日志',
        description: '系统事件的记录和查询功能'
      },
      {
        name: '告警管理',
        description: '告警信息的查询、处理和统计功能'
      },
      {
        name: '自动化规则',
        description: '智能化规则的创建和管理功能'
      }
    ]
  },
  apis: ['./modle/**/*.js']
};

const specs = swaggerJsdoc(options);

export { specs, swaggerUi };