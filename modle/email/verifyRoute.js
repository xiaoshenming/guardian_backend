// modle/rabbitmq/authRouter.js
const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const db = require("../../config/db"); // 您的 db.js
const redis = require("../../config/redis"); // 您的 redis.js
// 引入封装好的邮件发送模块
const sendVerificationCode = require("./verifyUtil");
// 限制单个 IP 在 10 分钟内最多只能访问 10 次验证码发送接口
const sendCodeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 分钟
    max: 3,
    message: { code: 429, message: '请求过于频繁，请稍后再试！', data: null }
  });

// 验证码生成接口
router.post("/sendCode", sendCodeLimiter, async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ code: 400, message: "邮箱地址不能为空", data: null });
  }

  try {
    const { success, verificationCode, error } = await sendVerificationCode(
      email
    );

    if (success) {
      redis.set(`code_${email}`, verificationCode, "EX", 10 * 60); // 设置验证码过期时间为 10 分钟

      res.json({
        code: 200,
        message: `验证码已发送至邮箱 ${email}`,
        data: null,
      });
    } else {
      console.error("发送验证码失败：", error);
      res.status(500).json({
        code: 500,
        message: "验证码发送失败，请稍后重试",
        data: null,
      });
    }
  } catch (error) {
    console.error("发送验证码失败：", error);
    res.status(500).json({
      code: 500,
      message: "验证码发送失败，请稍后重试",
      data: null,
    });
  }
});
module.exports = router;