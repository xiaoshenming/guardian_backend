# Guardian Backend API 文档

## 概述

Guardian Backend 是一个基于 Node.js + Express 的后端服务，提供用户认证、权限管理等功能。

## 基础信息

- **基础URL**: `http://localhost:3000`
- **数据格式**: JSON
- **字符编码**: UTF-8

## 通用响应格式

所有接口都遵循统一的响应格式：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {}
}
```

## 认证方式

大部分接口需要在请求头中携带认证信息：

```
Authorization: Bearer <JWT_TOKEN>
deviceType: web
```

## 接口列表

### 1. 邮箱验证相关

#### 1.1 发送验证码

**接口地址**: `POST /api/email/sendCode`

**请求参数**:
```json
{
  "email": "user@example.com",
  "type": 1
}
```

**参数说明**:
- `email`: 邮箱地址（必填）
- `type`: 验证码类型（必填）
  - `1`: 注册
  - `2`: 忘记密码

**响应示例**:
```json
{
  "code": 200,
  "message": "验证码已发送至邮箱 user@example.com",
  "data": null
}
```

**限流规则**: 10分钟内最多3次

### 2. 认证相关

#### 2.1 用户注册

**接口地址**: `POST /api/auth/register`

**请求参数**:
```json
{
  "name": "testuser",
  "email": "user@example.com",
  "password": "123456",
  "code": "123456"
}
```

**参数说明**:
- `name`: 用户名（必填）
- `email`: 邮箱地址（必填）
- `password`: 密码，至少6位（必填）
- `code`: 邮箱验证码（必填）

**响应示例**:
```json
{
  "code": 200,
  "message": "注册成功",
  "data": {
    "userId": 10001,
    "loginId": 1
  }
}
```

**限流规则**: 1小时内最多3次

#### 2.2 用户登录

**接口地址**: `POST /api/auth/login`

**请求参数**:
```json
{
  "name": "testuser",
  "password": "123456",
  "deviceType": "web"
}
```

**参数说明**:
- `name`: 用户名/邮箱/手机号（必填）
- `password`: 密码（必填）
- `deviceType`: 设备类型，默认"web"（可选）

**响应示例**:
```json
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "uid": 10001,
      "role": 1,
      "email": "user@example.com",
      "loginName": "testuser"
    }
  }
}
```

**限流规则**: 15分钟内最多5次

#### 2.3 退出登录

**接口地址**: `POST /api/auth/logout`

**请求头**:
```
Authorization: Bearer <JWT_TOKEN>
deviceType: web
```

**响应示例**:
```json
{
  "code": 200,
  "message": "退出登录成功",
  "data": null
}
```

#### 2.4 忘记密码

**接口地址**: `POST /api/auth/forget`

**请求参数**:
```json
{
  "email": "user@example.com",
  "password": "newpassword",
  "code": "123456"
}
```

**参数说明**:
- `email`: 邮箱地址（必填）
- `password`: 新密码，至少6位（必填）
- `code`: 邮箱验证码（必填）

**响应示例**:
```json
{
  "code": 200,
  "message": "密码重置成功",
  "data": null
}
```

### 3. 用户相关

#### 3.1 获取个人信息

**接口地址**: `GET /api/user/info`

**请求头**:
```
Authorization: Bearer <JWT_TOKEN>
deviceType: web
```

**响应示例**:
```json
{
  "code": 200,
  "message": "获取用户信息成功",
  "data": {
    "id": 10001,
    "username": "testuser",
    "email": "user@example.com",
    "phone_number": null,
    "avatar_url": null,
    "gender": null,
    "status": "正常",
    "last_login_time": "2024-01-01 12:00:00",
    "create_time": "2024-01-01 10:00:00",
    "role": 1
  }
}
```

### 4. 权限测试接口

#### 4.1 无权限用户测试

**接口地址**: `GET /api/user/test/no-permission`

**权限要求**: role = 0

**请求头**:
```
Authorization: Bearer <JWT_TOKEN>
deviceType: web
```

#### 4.2 普通用户测试

**接口地址**: `GET /api/user/test/normal-user`

**权限要求**: role = 1

#### 4.3 管理员测试

**接口地址**: `GET /api/user/test/admin`

**权限要求**: role = 2

#### 4.4 超级管理员测试

**接口地址**: `GET /api/user/test/super-admin`

**权限要求**: role = 3

#### 4.5 多角色权限测试

**接口地址**: `GET /api/user/test/multi-role`

**权限要求**: role ∈ [1, 2, 3]

#### 4.6 任意用户测试

**接口地址**: `GET /api/user/test/any-user`

**权限要求**: 任何已登录用户

## 错误码说明

| 错误码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权/Token无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

## 用户角色说明

| 角色值 | 角色名称 | 说明 |
|--------|----------|------|
| 0 | 无权限 | 受限用户 |
| 1 | 普通用户 | 基础功能权限 |
| 2 | 管理员 | 管理功能权限 |
| 3 | 超级管理员 | 所有权限 |

## 使用示例

### 完整的注册登录流程

1. **发送注册验证码**
```bash
curl -X POST http://localhost:3000/api/email/sendCode \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","type":1}'
```

2. **用户注册**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"testuser","email":"test@example.com","password":"123456","code":"123456"}'
```

3. **用户登录**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"name":"testuser","password":"123456","deviceType":"web"}'
```

4. **获取用户信息**
```bash
curl -X GET http://localhost:3000/api/user/info \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "deviceType: web"
```

5. **退出登录**
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "deviceType: web"
```

## 注意事项

1. **验证码有效期**: 5分钟
2. **JWT有效期**: 7天
3. **Redis存储格式**:
   - 验证码: `guardian:Verification_code:code_{email}_{type}`
   - JWT: `guardian:user:user_{userId}:{deviceType}_token`
4. **密码要求**: 至少6位字符
5. **邮箱格式**: 标准邮箱格式验证
6. **手机号格式**: 11位纯数字

## 环境配置

请参考 `.env.example` 文件配置相应的环境变量。