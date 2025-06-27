// model/user/userUtils.js
const db = require("../../config/db"); // 您的 db.js
const redis = require("../../config/redis"); // 您的 redis.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const secret = process.env.JWT_SECRET;

/** 生成 JWT */
function generateJWT(loginUser, deviceType) {
  // loginUser 是 loginverification 表中的一个条目
  return jwt.sign(
    {
      id: loginUser.id,
      role: loginUser.role,
      device: deviceType,
      name: loginUser.name,
      email: loginUser.email,
    }, // 如果 JWT 中需要更多字段，请在此添加
    secret,
    { expiresIn: "7d" } // 例如：7 天
  );
}

/** 将 JWT 保存到 Redis (例如，活动会话为1小时，JWT 本身具有更长的有效期) */
async function saveJWTToRedis(loginVerificationId, token, deviceType) {
  await redis.set(
    `user_${loginVerificationId}_${deviceType}_token`,
    token,
    "EX",
    3600 * 24 * 7 // 匹配 JWT 有效期或更短，用于活动会话跟踪
  );
}

/** 从 Redis 中删除 JWT */
async function deleteJWTFromRedis(loginVerificationId, deviceType) {
  await redis.del(`user_${loginVerificationId}_${deviceType}_token`);
}

module.exports = {
  
};


