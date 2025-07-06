// userRouters.js
import express from "express";
import userUtils from "./userUtils.js";
import authorize from "../auth/authUtils.js"; // 您的授权中间件

const router = express.Router();

/**
 * @swagger
 * /api/user/info:
 *   get:
 *     summary: 获取个人信息
 *     description: 获取当前登录用户的详细信息，包括基本资料和角色权限
 *     tags: [用户管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 获取用户信息成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           description: 用户ID
 *                         username:
 *                           type: string
 *                           description: 用户名
 *                         email:
 *                           type: string
 *                           description: 邮箱地址
 *                         phone_number:
 *                           type: string
 *                           description: 手机号码
 *                         avatar_url:
 *                           type: string
 *                           description: 头像URL
 *                         gender:
 *                           type: string
 *                           description: 性别
 *                         status:
 *                           type: integer
 *                           description: 账户状态
 *                         last_login_time:
 *                           type: string
 *                           format: date-time
 *                           description: 最后登录时间
 *                         create_time:
 *                           type: string
 *                           format: date-time
 *                           description: 创建时间
 *                         role:
 *                           type: integer
 *                           description: 用户角色 (0:无权限 1:普通用户 2:管理员 3:超级管理员)
 *       401:
 *         description: 未授权访问
 *       404:
 *         description: 用户不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get("/info", authorize(), async (req, res) => {
  try {
    const userId = req.user.id;
    const userUid = req.user.uid || userId; // 兼容处理

    // 获取登录信息
    const loginInfo = await userUtils.findUserById(userId);
    if (!loginInfo) {
      return res.status(404).json({
        code: 404,
        message: "用户不存在",
        data: null,
        error: null
      });
    }

    // 获取用户详细信息
    const userProfile = await userUtils.findUserProfileById(loginInfo.uid);
    if (!userProfile) {
      return res.status(404).json({
        code: 404,
        message: "用户资料不存在",
        data: null,
        error: null
      });
    }

    // 返回用户信息（排除隐私数据）
    const userInfo = {
      id: userProfile.id,
      username: userProfile.username,
      email: userProfile.email,
      phone_number: userProfile.phone_number,
      avatar_url: userProfile.avatar_url,
      gender: userProfile.gender,
      status: userProfile.status,
      last_login_time: userProfile.last_login_time,
      create_time: userProfile.create_time,
      role: loginInfo.role
      // 排除敏感信息如 id_card, wechat_openid, wechat_unionid
    };

    res.json({
      code: 200,
      message: "获取用户信息成功",
      data: userInfo,
      error: null
    });

  } catch (error) {
    console.error("获取用户信息错误:", error);
    res.status(500).json({
      code: 500,
      message: "服务器内部错误",
      data: null,
      error: null
    });
  }
});

/**
 * @swagger
 * /api/user/test/no-permission:
 *   get:
 *     summary: 无权限用户测试接口
 *     description: 仅允许角色为0（无权限）的用户访问的测试接口
 *     tags: [权限测试]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 访问成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userRole:
 *                           type: integer
 *                           description: 当前用户角色
 *                         requiredRoles:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           description: 所需角色权限
 *                         description:
 *                           type: string
 *                           description: 接口说明
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 */
router.get("/test/no-permission", authorize([0]), async (req, res) => {
  res.json({
    code: 200,
    message: "无权限用户测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [0],
      description: "此接口仅允许角色为0（无权限）的用户访问"
    },
    error: null
  });
});

/**
 * @swagger
 * /api/user/test/normal-user:
 *   get:
 *     summary: 普通用户测试接口
 *     description: 仅允许角色为1（普通用户）的用户访问的测试接口
 *     tags: [权限测试]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 访问成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userRole:
 *                           type: integer
 *                           description: 当前用户角色
 *                         requiredRoles:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           description: 所需角色权限
 *                         description:
 *                           type: string
 *                           description: 接口说明
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 */
router.get("/test/normal-user", authorize([1]), async (req, res) => {
  res.json({
    code: 200,
    message: "普通用户测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [1],
      description: "此接口仅允许角色为1（普通用户）的用户访问"
    },
    error: null
  });
});

/**
 * @swagger
 * /api/user/test/admin:
 *   get:
 *     summary: 管理员测试接口
 *     description: 仅允许角色为2（管理员）的用户访问的测试接口
 *     tags: [权限测试]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 访问成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userRole:
 *                           type: integer
 *                           description: 当前用户角色
 *                         requiredRoles:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           description: 所需角色权限
 *                         description:
 *                           type: string
 *                           description: 接口说明
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 */
router.get("/test/admin", authorize([2]), async (req, res) => {
  res.json({
    code: 200,
    message: "管理员测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [2],
      description: "此接口仅允许角色为2（管理员）的用户访问"
    },
    error: null
  });
});

/**
 * @swagger
 * /api/user/test/super-admin:
 *   get:
 *     summary: 超级管理员测试接口
 *     description: 仅允许角色为3（超级管理员）的用户访问的测试接口
 *     tags: [权限测试]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 访问成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userRole:
 *                           type: integer
 *                           description: 当前用户角色
 *                         requiredRoles:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           description: 所需角色权限
 *                         description:
 *                           type: string
 *                           description: 接口说明
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 */
router.get("/test/super-admin", authorize([3]), async (req, res) => {
  res.json({
    code: 200,
    message: "超级管理员测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [3],
      description: "此接口仅允许角色为3（超级管理员）的用户访问"
    },
    error: null
  });
});

/**
 * @swagger
 * /api/user/test/multi-role:
 *   get:
 *     summary: 多角色权限测试接口
 *     description: 允许角色为1（普通用户）、2（管理员）、3（超级管理员）的用户访问的测试接口
 *     tags: [权限测试]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 访问成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userRole:
 *                           type: integer
 *                           description: 当前用户角色
 *                         requiredRoles:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           description: 所需角色权限
 *                         description:
 *                           type: string
 *                           description: 接口说明
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 */
router.get("/test/multi-role", authorize([1, 2, 3]), async (req, res) => {
  res.json({
    code: 200,
    message: "多角色权限测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: [1, 2, 3],
      description: "此接口允许角色为1（普通用户）、2（管理员）、3（超级管理员）的用户访问"
    },
    error: null
  });
});

/**
 * @swagger
 * /api/user/test/any-user:
 *   get:
 *     summary: 无角色限制测试接口
 *     description: 允许任何已登录用户访问的测试接口，无角色限制
 *     tags: [权限测试]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 访问成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         userRole:
 *                           type: integer
 *                           description: 当前用户角色
 *                         requiredRoles:
 *                           type: string
 *                           description: 所需角色权限
 *                         description:
 *                           type: string
 *                           description: 接口说明
 *       401:
 *         description: 未授权访问
 */
router.get("/test/any-user", authorize(), async (req, res) => {
  res.json({
    code: 200,
    message: "无角色限制测试接口访问成功",
    data: {
      userRole: req.user.role,
      requiredRoles: "任何已登录用户",
      description: "此接口允许任何已登录的用户访问，无角色限制"
    },
    error: null
  });
});

export default router;
