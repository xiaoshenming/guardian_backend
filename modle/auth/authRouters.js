// authRouters.js
import express from "express";
import rateLimit from "express-rate-limit";
import redis from "../../config/redis.js";
import userUtils from "../user/userUtils.js";
import authorize from "./authUtils.js";

const router = express.Router();

// 登录限流：每1分钟最多5次登录尝试
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 5,
  message: { code: 429, message: '登录尝试过于频繁，请稍后再试！', data: null },
  standardHeaders: true,
  legacyHeaders: false,
});

// 注册限流：每小时最多3次注册尝试
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: 3,
  message: { code: 429, message: '注册尝试过于频繁，请稍后再试！', data: null, error: null },
});
/**
 * @swagger
 * /api/auth/codes:
 *   get:
 *     summary: 获取用户权限码
 *     description: 根据用户角色返回对应的权限码列表，用于前端权限控制
 *     tags: [认证管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 获取权限码成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ['AC_100100', 'AC_100110']
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get("/codes", authorize([1, 2, 3]), async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // 根据用户角色返回对应的权限码
    let accessCodes = [];
    
    switch(userRole) {
      case 1: // 普通用户
        accessCodes = ['AC_100100', 'AC_100110'];
        break;
      case 2: // 管理员
        accessCodes = ['AC_100100', 'AC_100110', 'AC_100120'];
        break;
      case 3: // 超级管理员
        accessCodes = ['AC_100100', 'AC_100110', 'AC_100120', 'AC_100010']; // 所有权限
        break;
      default:
        accessCodes = [];
    }
    
    res.json({
      code: 200,
      message: 'ok',
      data: accessCodes,
      error: null
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '获取权限码失败',
      data: null,
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: 用户登录
 *     description: 支持用户名、邮箱、手机号三种方式登录，返回JWT令牌
 *     tags: [认证管理]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 description: 用户名、邮箱或手机号
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 description: 用户密码
 *                 example: "123456"
 *               deviceType:
                 type: string
                 enum: [web, mobile, desktop]
                 default: web
                 description: 设备类型，用于区分不同终端的登录会话（必需参数）
 *     responses:
 *       200:
 *         description: 登录成功
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
 *                         token:
 *                           type: string
 *                           description: JWT访问令牌
 *                         user:
 *                           $ref: '#/components/schemas/User'
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 用户名或密码错误
 *       429:
 *         description: 登录尝试过于频繁
 *       500:
 *         description: 服务器内部错误
 */
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { name, password, deviceType = "web" } = req.body;

    if (!name || !password) {
      return res.status(400).json({
        code: 400,
        message: "用户名/邮箱/手机号和密码不能为空",
        data: null,
        error: null
      });
    }

    // 尝试通过不同方式查找用户
    let user = null;
    
    // 检查是否为邮箱格式
    if (name.includes('@')) {
      user = await userUtils.findUserByEmail(name);
    } 
    // 检查是否为手机号格式（简单判断：纯数字且长度为11）
    else if (/^\d{11}$/.test(name)) {
      user = await userUtils.findUserByPhone(name);
    } 
    // 否则按用户名查找
    else {
      user = await userUtils.findUserByLoginName(name);
    }

    if (!user) {
      return res.status(401).json({
        code: 401,
        message: "用户不存在",
        data: null,
        error: null
      });
    }

    // 验证密码
    const isPasswordValid = await userUtils.verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        code: 401,
        message: "密码错误",
        data: null,
        error: null
      });
    }

    // 生成JWT
    const token = userUtils.generateJWT(user, deviceType);
    
    // 保存到Redis
    await userUtils.saveJWTToRedisNew(user.id, token, deviceType);
    
    // 更新最后登录时间
    await userUtils.updateLastLoginTime(user.uid);

    res.json({
      code: 200,
      message: "登录成功",
      data: {
        token,
        user: {
          id: user.id,
          uid: user.uid,
          role: user.role,
          email: user.email,
          loginName: user.login_name
        }
      },
      error: null
    });

  } catch (error) {
    console.error("登录错误:", error);
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
 * /api/auth/register:
 *   post:
 *     summary: 用户注册
 *     description: 新用户注册，需要邮箱验证码验证
 *     tags: [认证管理]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 description: 用户名
 *                 example: "张三"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱地址
 *                 example: "user@example.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 description: 密码，至少6位
 *                 example: "123456"
 *               code:
 *                 type: string
 *                 description: 邮箱验证码
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: 注册成功
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
 *                         userId:
 *                           type: integer
 *                           description: 用户档案ID
 *                         loginId:
 *                           type: integer
 *                           description: 登录账户ID
 *       400:
 *         description: 请求参数错误或验证码错误
 *       429:
 *         description: 注册尝试过于频繁
 *       500:
 *         description: 服务器内部错误
 */
router.post("/register", registerLimiter, async (req, res) => {
  try {
    const { name, email, password, code } = req.body;

    // 验证必填字段
    if (!name || !email || !password || !code) {
      return res.status(400).json({
        code: 400,
        message: "用户名、邮箱、密码和验证码不能为空",
        data: null,
        error: null
      });
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        code: 400,
        message: "邮箱格式不正确",
        data: null,
        error: null
      });
    }

    // 验证密码强度（至少6位）
    if (password.length < 6) {
      return res.status(400).json({
        code: 400,
        message: "密码长度至少为6位",
        data: null,
        error: null
      });
    }

    // 验证验证码
    const redisKey = `guardian:Verification_code:code_${email}_1`;
    const storedCode = await redis.get(redisKey);
    
    if (!storedCode) {
      return res.status(400).json({
        code: 400,
        message: "验证码已过期或不存在",
        data: null,
        error: null
      });
    }

    if (storedCode !== code) {
      return res.status(400).json({
        code: 400,
        message: "验证码错误",
        data: null,
        error: null
      });
    }

    // 检查邮箱是否已被注册
    const existingUser = await userUtils.findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        code: 400,
        message: "该邮箱已被注册",
        data: null,
        error: null
      });
    }

    // 检查用户名是否已被使用
    const existingLoginName = await userUtils.findUserByLoginName(name);
    if (existingLoginName) {
      return res.status(400).json({
        code: 400,
        message: "该用户名已被使用",
        data: null,
        error: null
      });
    }

    // 创建用户
    const result = await userUtils.createUser({
      username: name,
      email: email,
      password: password
    });

    // 删除已使用的验证码
    await redis.del(redisKey);

    res.json({
      code: 200,
      message: "注册成功",
      data: {
        userId: result.userId,
        loginId: result.loginId
      },
      error: null
    });

  } catch (error) {
    console.error("注册错误:", error);
    res.status(500).json({
      code: 500,
      message: "服务器内部错误",
      data: null,
      error: null
    });
  }
});

// 退出登录接口
router.post("/logout", authorize(), async (req, res) => {
  try {
    const deviceType = req.headers.devicetype || "web";
    const userId = req.user.id;

    // 从Redis中删除JWT
    await userUtils.deleteJWTFromRedisNew(userId, deviceType);

    res.json({
      code: 200,
      message: "退出登录成功",
      data: null,
      error: null
    });

  } catch (error) {
    console.error("退出登录错误:", error);
    res.status(500).json({
      code: 500,
      message: "服务器内部错误",
      data: null,
      error: null
    });
  }
});

// 忘记密码接口
router.post("/forget", async (req, res) => {
  try {
    const { email, password, code } = req.body;

    if (!email || !password || !code) {
      return res.status(400).json({
        code: 400,
        message: "邮箱、新密码和验证码不能为空",
        data: null,
        error: null
      });
    }

    // 验证密码强度
    if (password.length < 6) {
      return res.status(400).json({
        code: 400,
        message: "密码长度至少为6位",
        data: null,
        error: null
      });
    }

    // 验证验证码
    const redisKey = `guardian:Verification_code:code_${email}_2`;
    const storedCode = await redis.get(redisKey);
    
    if (!storedCode) {
      return res.status(400).json({
        code: 400,
        message: "验证码已过期或不存在",
        data: null,
        error: null
      });
    }

    if (storedCode !== code) {
      return res.status(400).json({
        code: 400,
        message: "验证码错误",
        data: null,
        error: null
      });
    }

    // 检查用户是否存在
    const user = await userUtils.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({
        code: 404,
        message: "用户不存在",
        data: null,
        error: null
      });
    }

    // 更新密码
    await userUtils.updateUserPassword(email, password);
    
    // 删除已使用的验证码
    await redis.del(redisKey);

    res.json({
      code: 200,
      message: "密码重置成功",
      data: null,
      error: null
    });

  } catch (error) {
    console.error("忘记密码错误:", error);
    res.status(500).json({
      code: 500,
      message: "服务器内部错误",
      data: null,
      error: null
    });
  }
});

export default router;