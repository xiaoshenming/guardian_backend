// userUtils.js
import db from "../../config/db.js"; // 您的 db.js
import redis from "../../config/redis.js"; // 您的 redis.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

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

/** 根据邮箱查找用户登录信息 */
async function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM login_verification WHERE email = ?';
    db.query(query, [email], (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
}

/** 根据用户名查找用户登录信息 */
async function findUserByLoginName(loginName) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM login_verification WHERE login_name = ?';
    db.query(query, [loginName], (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
}

/** 根据手机号查找用户登录信息 */
async function findUserByPhone(phone) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM login_verification WHERE phone_number = ?';
    db.query(query, [phone], (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
}

/** 根据ID查找用户登录信息 */
async function findUserById(id) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM login_verification WHERE id = ?';
    db.query(query, [id], (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
}

/** 根据用户ID查找用户详细信息 */
async function findUserProfileById(uid) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM user_profile WHERE id = ?';
    db.query(query, [uid], (err, results) => {
      if (err) reject(err);
      else resolve(results[0]);
    });
  });
}

/** 创建新用户 */
async function createUser(userData) {
  return new Promise((resolve, reject) => {
    db.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }
      
      connection.beginTransaction(async (err) => {
        if (err) {
          connection.release();
          reject(err);
          return;
        }
        
        try {
          // 1. 创建用户资料
          const profileQuery = 'INSERT INTO user_profile (username, email, status) VALUES (?, ?, ?)';
          const profileResult = await new Promise((resolve, reject) => {
            connection.query(profileQuery, [userData.username, userData.email, '正常'], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          const userId = profileResult.insertId;
          
          // 2. 创建登录凭证
          const hashedPassword = await bcrypt.hash(userData.password, 10);
          const loginQuery = 'INSERT INTO login_verification (uid, login_name, password_hash, email, role) VALUES (?, ?, ?, ?, ?)';
          const loginResult = await new Promise((resolve, reject) => {
            connection.query(loginQuery, [userId, userData.username, hashedPassword, userData.email, 1], (err, results) => {
              if (err) reject(err);
              else resolve(results);
            });
          });
          
          connection.commit((err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                reject(err);
              });
            } else {
              connection.release();
              resolve({ userId, loginId: loginResult.insertId });
            }
          });
        } catch (error) {
          connection.rollback(() => {
            connection.release();
            reject(error);
          });
        }
      });
    });
  });
}

/** 更新用户密码 */
async function updateUserPassword(email, newPassword) {
  return new Promise(async (resolve, reject) => {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      const query = 'UPDATE login_verification SET password_hash = ? WHERE email = ?';
      db.query(query, [hashedPassword, email], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/** 验证密码 */
async function verifyPassword(plainPassword, hashedPassword) {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

/** 更新用户最后登录时间 */
async function updateLastLoginTime(userId) {
  return new Promise((resolve, reject) => {
    const query = 'UPDATE user_profile SET last_login_time = NOW() WHERE id = ?';
    db.query(query, [userId], (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

/** 按照新的Redis格式保存JWT */
async function saveJWTToRedisNew(loginVerificationId, token, deviceType) {
  const redisKey = `guardian:user:user_${loginVerificationId}:${deviceType}_token`;
  await redis.set(redisKey, token, "EX", 3600 * 24 * 7); // 7天有效期
}

/** 按照新的Redis格式删除JWT */
async function deleteJWTFromRedisNew(loginVerificationId, deviceType) {
  const redisKey = `guardian:user:user_${loginVerificationId}:${deviceType}_token`;
  await redis.del(redisKey);
}

/** 按照新的Redis格式检查JWT */
async function checkJWTInRedisNew(userId, token, deviceType) {
  const redisKey = `guardian:user:user_${userId}:${deviceType}_token`;
  const storedToken = await redis.get(redisKey);
  return storedToken === token;
}

export {
  generateJWT,
  saveJWTToRedis,
  deleteJWTFromRedis,
  saveJWTToRedisNew,
  deleteJWTFromRedisNew,
  checkJWTInRedisNew,
  findUserByEmail,
  findUserByLoginName,
  findUserByPhone,
  findUserById,
  findUserProfileById,
  createUser,
  updateUserPassword,
  verifyPassword,
  updateLastLoginTime
};

export default {
  generateJWT,
  saveJWTToRedis,
  deleteJWTFromRedis,
  saveJWTToRedisNew,
  deleteJWTFromRedisNew,
  checkJWTInRedisNew,
  findUserByEmail,
  findUserByLoginName,
  findUserByPhone,
  findUserById,
  findUserProfileById,
  createUser,
  updateUserPassword,
  verifyPassword,
  updateLastLoginTime
};


