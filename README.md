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

-- ----------------------------
-- 3. 守护圈信息表 (guardian_circle)
-- ----------------------------
DROP TABLE IF EXISTS `guardian_circle`;
CREATE TABLE `guardian_circle` (
  `id` INT AUTO_INCREMENT COMMENT '守护圈唯一ID (由PRIMARY KEY保证其非空和唯一)',
  `circle_name` VARCHAR(255) NULL COMMENT '守护圈名称 (例如: "爷爷奶奶家")',
  `creator_uid` INT NULL COMMENT '创建该圈子的用户ID (对应 user_profile.id)',
  `circle_code` VARCHAR(255) NULL COMMENT '圈子邀请码，用于分享和加入',
  `description` VARCHAR(1024) NULL COMMENT '守护圈描述，如地址、注意事项等',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_creator_uid`(`creator_uid`) USING BTREE,
  INDEX `idx_circle_code`(`circle_code`) USING BTREE
) ENGINE=InnoDB COMMENT='守护圈信息表 ';

-- ----------------------------
-- 4. 守护圈成员关系表 (circle_member_map)
-- ----------------------------
DROP TABLE IF EXISTS `circle_member_map`;
CREATE TABLE `circle_member_map` (
  `id` INT AUTO_INCREMENT COMMENT '关系ID (由PRIMARY KEY保证其非空和唯一)',
  `circle_id` INT NULL COMMENT '守护圈ID (对应 guardian_circle.id)',
  `uid` INT NULL COMMENT '用户ID (对应 user_profile.id)',
  `member_role` TINYINT NULL DEFAULT 1 COMMENT '成员角色 (0:圈主/管理员, 1:普通成员/监护人, 2:被关怀者)',
  `member_alias` VARCHAR(255) NULL COMMENT '成员在圈内的昵称',
  `alert_level` TINYINT NULL DEFAULT 1 COMMENT '接收告警级别 (1:所有, 2:高危, 0:不接收)',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_circle_id`(`circle_id`) USING BTREE,
  INDEX `idx_uid_member`(`uid`) USING BTREE
) ENGINE=InnoDB COMMENT='守护圈成员关系表 ';

-- ----------------------------
-- 5. 设备信息表 (device_info)
-- ----------------------------
DROP TABLE IF EXISTS `device_info`;
CREATE TABLE `device_info` (
  `id` INT AUTO_INCREMENT COMMENT '设备ID (由PRIMARY KEY保证其非空和唯一)',
  `device_sn` VARCHAR(255) NULL COMMENT '设备唯一序列号 (SN)',
  `device_name` VARCHAR(255) NULL COMMENT '设备自定义名称',
  `device_model` VARCHAR(255) NULL DEFAULT 'Hi3516' COMMENT '设备型号',
  `circle_id` INT NULL COMMENT '绑定的守护圈ID (对应 guardian_circle.id)',
  `bound_by_uid` INT NULL COMMENT '执行绑定操作的用户ID',
  `device_status` TINYINT NULL DEFAULT 0 COMMENT '设备状态 (0:未激活, 1:在线, 2:离线, 3:故障)',
  `firmware_version` VARCHAR(100) NULL COMMENT '固件版本号',
  `config` JSON NULL COMMENT '设备专属配置(JSON格式)，如灵敏度、检测区域等',
  `last_heartbeat` DATETIME NULL COMMENT '设备最后心跳时间',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '绑定时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_device_sn`(`device_sn`) USING BTREE,
  INDEX `idx_circle_id_device`(`circle_id`) USING BTREE
) ENGINE=InnoDB COMMENT='硬件设备信息表 ';

-- ----------------------------
-- 6. 事件日志表 (event_log)
-- ----------------------------
DROP TABLE IF EXISTS `event_log`;
CREATE TABLE `event_log` (
  `id` BIGINT AUTO_INCREMENT COMMENT '事件日志ID (由PRIMARY KEY保证其非空和唯一)',
  `device_id` INT NULL COMMENT '上报事件的设备ID (对应 device_info.id)',
  `circle_id` INT NULL COMMENT '事件发生的守护圈ID',
  `event_type` VARCHAR(100) NULL COMMENT '事件类型 (如: fall_detection, gesture_wave)',
  `event_data` JSON NULL COMMENT '事件相关数据 (JSON格式)，如截图URL、置信度',
  `event_time` DATETIME NULL COMMENT '事件实际发生时间 (由设备上报)',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录入库时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_device_id`(`device_id`) USING BTREE,
  INDEX `idx_event_type`(`event_type`) USING BTREE,
  INDEX `idx_event_time`(`event_time`) USING BTREE
) ENGINE=InnoDB COMMENT='所有设备上报的原始事件日志表 ';

-- ----------------------------
-- 7. 告警记录表 (alert_log)
-- ----------------------------
DROP TABLE IF EXISTS `alert_log`;
CREATE TABLE `alert_log` (
  `id` BIGINT AUTO_INCREMENT COMMENT '告警ID (由PRIMARY KEY保证其非空和唯一)',
  `event_id` BIGINT NULL COMMENT '关联的原始事件ID (对应 event_log.id)',
  `circle_id` INT NULL COMMENT '告警所属的守护圈ID',
  `alert_level` TINYINT NULL COMMENT '告警级别 (1:紧急, 2:重要, 3:普通)',
  `alert_content` VARCHAR(1024) NULL COMMENT '告警内容摘要',
  `status` TINYINT NULL DEFAULT 0 COMMENT '处理状态 (0:待处理, 1:已通知, 2:已确认, 3:已忽略)',
  `acknowledged_by_uid` INT NULL COMMENT '确认或处理该告警的用户ID',
  `acknowledged_time` DATETIME NULL COMMENT '告警被确认或处理的时间',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '告警生成时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_event_id`(`event_id`) USING BTREE,
  INDEX `idx_circle_id_alert`(`circle_id`, `status`) USING BTREE
) ENGINE=InnoDB COMMENT='需要人工干预的告警通知记录表 ';

-- ----------------------------
-- 8. 自动化规则表 (action_rule)
-- ----------------------------
DROP TABLE IF EXISTS `action_rule`;
CREATE TABLE `action_rule` (
  `id` INT AUTO_INCREMENT COMMENT '规则ID (由PRIMARY KEY保证其非空和唯一)',
  `rule_name` VARCHAR(255) NULL COMMENT '规则名称 (例如: "挥手开客厅灯")',
  `circle_id` INT NULL COMMENT '规则所属的守护圈ID',
  `trigger_device_id` INT NULL COMMENT '触发规则的设备ID (为空则代表圈内任意设备)',
  `trigger_event_type` VARCHAR(100) NULL COMMENT '触发事件类型 (如: gesture_wave)',
  `condition_logic` JSON NULL COMMENT '复杂条件逻辑 (JSON格式)',
  `action_type` VARCHAR(100) NULL COMMENT '执行动作类型 (如: send_sms, call_api)',
  `action_params` JSON NULL COMMENT '动作所需参数 (JSON格式)',
  `is_enabled` TINYINT NULL DEFAULT 1 COMMENT '是否启用该规则 (1:启用, 0:禁用)',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '规则创建时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '规则更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_circle_id_rule`(`circle_id`, `is_enabled`) USING BTREE
) ENGINE=InnoDB COMMENT='事件-动作自动化规则配置表 ';

-- ----------------------------
-- 9. 智能家居设备表 (smart_home_device)
-- ----------------------------
DROP TABLE IF EXISTS `smart_home_device`;
CREATE TABLE `smart_home_device` (
  `id` INT AUTO_INCREMENT COMMENT '智能设备ID (由PRIMARY KEY保证其非空和唯一)',
  `device_name` VARCHAR(255) NULL COMMENT '设备名称 (如: "客厅顶灯")',
  `circle_id` INT NULL COMMENT '所属守护圈ID',
  `protocol` VARCHAR(100) NULL COMMENT '控制协议 (如: Zigbee, Wi-Fi, Matter)',
  `api_endpoint` VARCHAR(1024) NULL COMMENT '控制该设备的API端点或MQTT主题',
  `status` VARCHAR(100) NULL COMMENT '设备当前状态 (JSON格式)',
  `create_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
  `update_time` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_circle_id_smarthome`(`circle_id`) USING BTREE
) ENGINE=InnoDB COMMENT='集成的第三方智能家居设备列表 ';

以上数据库是我已经实现并且运用的结果，你只需要实现代码的逻辑跟功能就好，数据库不用你操心。

# Guardian 智能守护系统 - 数据库设计说明

## 系统概述

以上是Guardian智能守护系统的完整数据库设计。该系统是一个基于物联网技术的智能守护平台，专为老年人和需要特殊关怀的人群设计。

## 技术架构

```
鸿蒙设备(Hi3516) → MQTT服务器 → Node.js后端 → Vben前端/鸿蒙App
```

## 核心功能

- **手势识别**: 通过摄像头识别手势，触发智能家居控制
- **跌倒检测**: 实时监控异常行为，及时发送告警
- **智能联动**: 与智能家居设备无缝集成
- **实时通知**: 向监护人手机发送重要信息

## 权限体系

1. **一级权限**: 普通用户（客户）- 基础功能使用
2. **二级权限**: 管理员（公司管理层）- 数据管理和审查
3. **三级权限**: 超级管理员 - 服务器数据和系统管理

## API规范

### 请求格式
- 请求体: JSON格式
- 认证头: `Authorization: Bearer <token>`
- 设备类型: `deviceType: web`

### 响应格式
```json
{
    "code": 200,
    "data": {},
    "error": null,
    "message": "ok"
}
```

## 扩展计划

- 微信小程序端
- 更多智能设备接入
- AI算法优化
- 云端数据分析