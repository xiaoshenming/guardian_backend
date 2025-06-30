import db from '../config/db.js';
import bcrypt from 'bcryptjs';

// 定义需要初始化的用户列表
const usersToSeed = [
    {
        profile: { id: 10001, username: 'admin', email: 'admin@admin.com', phone_number: '18888880001', status: '正常' },
        auth: { login_name: 'admin', password: '111111', role: 2 }
    },
    {
        profile: { id: 10002, username: 'test0', email: 'test0@test.com', phone_number: '18888880002', status: '正常' },
        auth: { login_name: 'test0', password: '111111', role: 0 }
    },
    {
        profile: { id: 10003, username: 'test1', email: 'test1@test.com', phone_number: '18888880003', status: '正常' },
        auth: { login_name: 'test1', password: '111111', role: 1 }
    },
    {
        profile: { id: 10004, username: 'test2', email: 'test2@test.com', phone_number: '18888880004', status: '正常' },
        auth: { login_name: 'test2', password: '111111', role: 2 }
    },
    {
        profile: { id: 10005, username: 'test3', email: 'test3@test.com', phone_number: '18888880005', status: '正常' },
        auth: { login_name: 'test3', password: '111111', role: 3 }
    }
];

/**
 * @description 检查用户是否存在，如果不存在则创建
 * @param {object} user - 包含 profile 和 auth 信息的单用户对象
 */
async function createUerIfNotExists(user) {
    const connection = await db.promise().getConnection();
    try {
        // 检查用户是否已存在 (通过 email)
        const [existing] = await connection.query('SELECT id FROM login_verification WHERE email = ?', [user.profile.email]);

        if (existing.length > 0) {
            console.log(`[Seed] 用户 '${user.auth.login_name}' 已存在, 跳过创建。`);
            return;
        }

        console.log(`[Seed] 正在创建用户 '${user.auth.login_name}'...`);

        // 启动事务
        await connection.beginTransaction();

        // 1. 创建用户资料 (user_profile)
        const [profileResult] = await connection.query('INSERT INTO user_profile SET ?', user.profile);
        const uid = profileResult.insertId; // 获取新创建的 profile id

        // 2. 加密密码
        const hashedPassword = await bcrypt.hash(user.auth.password, 10);

        // 3. 创建登录凭证 (login_verification)
        await connection.query('INSERT INTO login_verification SET ?', {
            uid: uid,
            login_name: user.auth.login_name,
            password_hash: hashedPassword,
            email: user.profile.email,
            phone_number: user.profile.phone_number,
            role: user.auth.role,
        });

        // 提交事务
        await connection.commit();
        console.log(`[Seed] 用户 '${user.auth.login_name}' 创建成功！`);

    } catch (error) {
        await connection.rollback(); // 如果出错，回滚事务
        console.error(`[Seed] 创建用户 '${user.auth.login_name}' 失败:`, error);
    } finally {
        connection.release(); // 释放连接回连接池
    }
}

/**
 * @description 主函数，执行所有用户的初始化
 */
export async function initializeDatabase() {
    console.log('[Seed] 开始执行数据库初始化脚本...');
    for (const user of usersToSeed) {
        await createUerIfNotExists(user);
    }
    console.log('[Seed] 数据库初始化脚本执行完毕。');
}
