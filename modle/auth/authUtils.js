// authUtils.js
import jwt from 'jsonwebtoken';
import redis from '../../config/redis.js';
import dotenv from 'dotenv';

dotenv.config();
const secret = process.env.JWT_SECRET;

// 定义一个辅助函数，用来检查 Redis 中的 JWT (新格式)
async function checkJWTInRedis(userId, token, deviceType) {
    const redisKey = `guardian:user:user_${userId}:${deviceType}_token`;
    const storedToken = await redis.get(redisKey);
    return storedToken === token;
}

// 定义鉴权中间件函数，支持传入允许的角色数组
function authorize(roles = []) {
    return async (req, res, next) => {
        console.log('开始权限验证，目标角色:', roles);

        const authHeader = req.headers.authorization;
        const deviceType = req.headers.devicetype; // 从请求头中获取设备类型
        if (!authHeader) {
            console.log('未提供授权信息');
            return res.status(401).json({
                code: 401,
                message: '未提供授权信息',
                data: null,
                error: null
            });
        }

        const token = authHeader.split(' ')[1];
        console.log('接收到的 Token:', token);
        try {
            const decoded = jwt.verify(token, secret);
            console.log('JWT 解码成功:', decoded);
            const isValid = await checkJWTInRedis(decoded.id, token, deviceType);

            if (!isValid) {
                console.log('Redis 中无效 Token');
                return res.status(401).json({
                    code: 401,
                    message: '无效的 Token',
                    data: null,
                    error: null
                });
            }
            // 重置 token 在 Redis 中的有效期到 3600 秒
            const redisKey = `guardian:user:user_${decoded.id}:${deviceType}_token`;
            await redis.expire(redisKey, 3600);

            console.log('用户角色：', decoded.role);
            if (roles.length && !roles.includes(decoded.role)) {
                console.log(`用户角色 ${decoded.role} 无权限访问`);
                return res.status(403).json({
                    code: 403,
                    message: `权限不足，用户角色 ${decoded.role} 无权限访问此资源`,
                    data: null,
                    error: null
                });
            }

            console.log('权限验证通过');
            req.user = decoded; // 将解码后的用户信息存入请求对象
            next();
        } catch (err) {
            console.error('权限验证错误:', err.message);
            return res.status(401).json({
                code: 401,
                message: '无效的 Token',
                data: null,
                error: null
            });
        }
    };
}

export default authorize;
