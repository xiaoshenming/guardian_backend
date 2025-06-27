-- -- 创建用户 'guardian'，允许从任何主机连接，并设置密码为 'guardian'
-- CREATE USER 'guardian'@'%' IDENTIFIED BY 'guardian';
-- 
-- -- 授予用户所有数据库和所有表的全部权限
-- GRANT ALL PRIVILEGES ON *.* TO 'guardian'@'%' WITH GRANT OPTION;
-- 
-- -- 刷新权限，使更改立即生效
-- FLUSH PRIVILEGES;

-- 创建名为DriveGo的数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS guardian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------------
-- 数据库: `guardian`
-- 设计理念:
-- 1. 认证与授权分离: `login_verification` 表负责用户登录凭证的管理。
-- 2. 用户信息集中: `user_profile` 表存储用户的详细资料。
-- 3. 功能模块化: 新增守护圈、成员和设备表，实现业务功能分离。
-- 4. 解除所有约束: 根据要求，移除了包括 NOT NULL, UNIQUE 在内的所有约束，以达到最大限度的灵活性。
-- 5. 保留性能索引: 保留了用于查询性能的常规索引。
-- 6. 详细注释: 为每个表和字段提供清晰的中文注释，方便后续维护。
-- --------------------------------------------------------------------------------

-- 建议在执行前先选择数据库
USE guardian;

-- ----------------------------
-- 1. 登录凭证表 (login_verification)
-- 职责: 存储用户的核心登录信息，此表应尽可能保持轻量，以实现最快的登录验证速度。
-- ----------------------------
DROP TABLE IF EXISTS `login_verification`;
CREATE TABLE `login_verification` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '主键ID，自增',
  `uid` INT NULL COMMENT '关联的用户ID (对应 user_profile 表的 id)',
  `login_name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '登录名，可以是用户名或第三方唯一标识',
  `password_hash` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '加密后的密码哈希值 (永远不要存储明文密码)',
  `phone_number` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '手机号码，可作为登录方式',
  `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '电子邮箱，可作为登录方式',
  `role` TINYINT NULL DEFAULT 0 COMMENT '用户角色 (例如: 0-无权, 1-普通用户, 2-管理员, 3-超管)',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录最后更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  -- 为常用查询字段创建索引，提升查询效率
  INDEX `idx_uid`(`uid`) USING BTREE,
  INDEX `idx_phone_number`(`phone_number`) USING BTREE,
  INDEX `idx_email`(`email`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户登录凭证表' ROW_FORMAT=DYNAMIC;


-- ----------------------------
-- 2. 用户资料表 (user_profile)
-- 职责: 存储用户的所有非登录相关的详细信息。
-- ----------------------------
DROP TABLE IF EXISTS `user_profile`;
CREATE TABLE `user_profile` (
  `id` INT NOT NULL AUTO_INCREMENT COMMENT '用户唯一ID (User ID)，自增',
  `username` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '用户昵称，用于显示',
  `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '电子邮箱 (主要用于通知)',
  `phone_number` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '手机号码',
  `avatar_url` VARCHAR(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '用户头像的URL地址',
  `gender` VARCHAR(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '性别',
  `id_card` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '身份证号码 (应加密存储)',
  `wechat_openid` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '微信开放平台唯一标识 (OpenID)',
  `wechat_unionid` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '微信平台统一标识 (UnionID)，用于跨应用识别用户',
  `status`  VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '状态（正常,注销,禁用）',
  `last_login_time` DATETIME NULL COMMENT '最后登录时间',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '账户创建时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '信息最后更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  -- 为常用查询字段创建索引
  INDEX `idx_email_profile`(`email`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=10001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='用户详细资料表' ROW_FORMAT=DYNAMIC;





以上是我的数据库结构，现在我要求你先完成登录注册的任务。要求能用上我现在给你搭建好的地基。去实现登录注册的功能。并且给出分别四级鉴权的测试接口。

登录接口 /api/auth/login  name/phone/email password deviceType(一般是web)
注册接口 /api/auth/register 邮箱跟用户名密码是必填，其他的都可以后期补充。 name/email password code(邮箱接口的验证码)
退出接口 /api/auth/logout  headers里面 Authorization: Bearer xxxxxxxxx ; deviceType:web (一般是web) 
忘记密码接口 /api/auth/forget  email password code(邮箱接口的验证码)
发送验证码接口 /api/auth/sendCode  email(必填) type(1:注册 2:忘记密码)

具体流程就是，用户输入邮箱跟密码注册，先调用发送验证码接口发送验证码（目前为空方法，发送逻辑以后再写，目前是存redis ，读取.env文件的REDIS_FOLDER=guardian，将验证码存入guardian/Verification_code下，存储格式为code_${email}_${type}）有效期五分钟,并且会查找数据库校验此邮箱是否被注册。然后用户调用注册接口，完成注册。接着用户登录，输入任意的name/phone/email 与准确的密码，和deviceType:web (一般是web)。 来实现登录。登录之后回参为jwt数据。(后端将用户的登录信息及其jwt存在redis里面，guardian/user下,格式为user_${userId}/${deviceType}_token，此处的userId为鉴权表的id，举例：在guardian/user目录下的 user_1目录下的web_xxxxxxxxxxxxxxxx)接下来前端会把jwt放在请求头里面调用个人信息接口去实现其他功能。鉴权中间件改为能识别guardian/user这种格式下的鉴权信息。并且后端的模块化全为一个路由类，一个方法类。app.js调用只需要调用路由即可。


个人信息接口 /api/user/info 请求头 Authorization: Bearer xxxxxxxxx ; deviceType:web 
响应
{
    "code": 200,
    "data": {
       各个数据（除隐私数据）
    },
    "error": null,
    "message": "ok"
}



几乎所有接口均为raw的json负载。然后请求头用Authorization: Bearer xxxxxxxxx ; deviceType:web (一般是web) 来鉴权。
所有接口响应遵循以下格式
{
    "code": 200,
    "data": {
       
    },
    "error": null,
    "message": "ok"
}