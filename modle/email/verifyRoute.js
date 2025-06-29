// verifyRoute.js
import express from "express";
import rateLimit from "express-rate-limit";
import db from "../../config/db.js"; // 您的 db.js
import redis from "../../config/redis.js"; // 您的 redis.js
// 引入封装好的邮件发送模块
import sendVerificationCode from "./verifyUtil.js";

const router = express.Router();
// 限制单个 IP 在 10 分钟内最多只能访问 10 次验证码发送接口
const sendCodeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 分钟
    max: 3,
    message: { code: 429, message: '请求过于频繁，请稍后再试！', data: null, error: null }
  });

// 验证码生成接口
router.post("/sendCode", sendCodeLimiter, async (req, res) => {
  const { email, type = 1 } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ code: 400, message: "邮箱地址不能为空", data: null, error: null });
  }

  // 验证type参数
  if (![1, 2].includes(type)) {
    return res
      .status(400)
      .json({ code: 400, message: "type参数错误，1:注册 2:忘记密码", data: null, error: null });
  }

  try {
    // 如果是注册类型，检查邮箱是否已被注册
    if (type === 1) {
      const checkEmailQuery = 'SELECT id FROM login_verification WHERE email = ?';
      const [existingUser] = await new Promise((resolve, reject) => {
        db.query(checkEmailQuery, [email], (err, results) => {
          if (err) reject(err);
          else resolve([results]);
        });
      });
      
      if (existingUser.length > 0) {
        return res.status(400).json({
          code: 400,
          message: "该邮箱已被注册",
          data: null,
          error: null
        });
      }
    }

    const { success, verificationCode, error } = await sendVerificationCode(
      email,
      type
    );

    if (success) {
      // 按照要求的格式存储：guardian/Verification_code/code_${email}_${type}
      const redisKey = `guardian:Verification_code:code_${email}_${type}`;
      await redis.set(redisKey, verificationCode, "EX", 5 * 60); // 设置验证码过期时间为 5 分钟

      res.json({
        code: 200,
        message: `验证码已发送至邮箱 ${email}`,
        data: null,
        error: null
      });
    } else {
      console.error("发送验证码失败：", error);
      res.status(500).json({
        code: 500,
        message: "验证码发送失败，请稍后重试",
        data: null,
        error: null
      });
    }
  } catch (error) {
    console.error("发送验证码失败：", error);
    res.status(500).json({
      code: 500,
      message: "验证码发送失败，请稍后重试",
      data: null,
      error: null
    });
  }
});
export default router;