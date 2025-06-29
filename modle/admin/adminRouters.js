const express = require('express');
const router = express.Router();
const authorize = require('../auth/authUtils');
const db = require('../../config/db');
const bcrypt = require('bcryptjs');

// 获取所有用户（仅管理员）
router.get('/users', authorize([3]), async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword, role, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let params = [];
    
    if (keyword) {
      whereClause += ' AND (u.username LIKE ? OR u.email LIKE ? OR u.real_name LIKE ?)';
      const searchTerm = `%${keyword}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (role !== undefined && role !== '') {
      whereClause += ' AND u.role = ?';
      params.push(parseInt(role));
    }
    
    if (status !== undefined && status !== '') {
      whereClause += ' AND u.status = ?';
      params.push(parseInt(status));
    }
    
    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM user_profile u
      ${whereClause}
    `;
    
    const [countRows] = await db.promise().execute(countQuery, params);
    const total = countRows[0].total;
    
    // 获取用户列表
    const query = `
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone,
        u.real_name,
        u.avatar,
        u.role,
        u.status,
        u.create_time,
        u.update_time,
        ul.login_time as last_login
      FROM user_profile u
      LEFT JOIN (
        SELECT user_id, MAX(login_time) as login_time
        FROM user_login
        GROUP BY user_id
      ) ul ON u.id = ul.user_id
      ${whereClause}
      ORDER BY u.create_time DESC
      LIMIT ? OFFSET ?
    `;
    
    const [rows] = await db.promise().execute(query, [...params, parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: {
        users: rows,
        total: parseInt(total),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ success: false, message: '获取用户列表失败' });
  }
});

// 更新用户角色（仅超级管理员）
router.put('/users/:userId/role', authorize([3]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (![1, 2, 3].includes(parseInt(role))) {
      return res.status(400).json({ success: false, message: '无效的角色值' });
    }
    
    // 检查用户是否存在
    const [userRows] = await db.promise().execute(
      'SELECT id FROM user_profile WHERE id = ?',
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 更新用户角色
    await db.promise().execute(
      'UPDATE user_profile SET role = ?, update_time = NOW() WHERE id = ?',
      [parseInt(role), userId]
    );
    
    res.json({ success: true, message: '用户角色更新成功' });
  } catch (error) {
    console.error('更新用户角色失败:', error);
    res.status(500).json({ success: false, message: '更新用户角色失败' });
  }
});

// 禁用/启用用户（仅管理员）
router.put('/users/:userId/status', authorize([3]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;
    
    if (![0, 1].includes(parseInt(status))) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    // 检查用户是否存在
    const [userRows] = await db.promise().execute(
      'SELECT id FROM user_profile WHERE id = ?',
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 更新用户状态
    await db.execute(
      'UPDATE user_profile SET status = ?, update_time = NOW() WHERE id = ?',
      [parseInt(status), userId]
    );
    
    const statusText = parseInt(status) === 1 ? '启用' : '禁用';
    res.json({ success: true, message: `用户${statusText}成功` });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    res.status(500).json({ success: false, message: '更新用户状态失败' });
  }
});

// 获取系统日志（仅管理员）
router.get('/logs', authorize([3]), async (req, res) => {
  try {
    const { page = 1, limit = 10, level, startTime, endTime } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let params = [];
    
    if (level) {
      whereClause += ' AND level = ?';
      params.push(level);
    }
    
    if (startTime) {
      whereClause += ' AND create_time >= ?';
      params.push(startTime);
    }
    
    if (endTime) {
      whereClause += ' AND create_time <= ?';
      params.push(endTime);
    }
    
    // 获取总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM system_log
      ${whereClause}
    `;
    
    const [countRows] = await db.promise().execute(countQuery, params);
    const total = countRows[0].total;
    
    // 获取日志列表
    const query = `
      SELECT 
        id,
        level,
        message,
        user_id,
        ip_address,
        user_agent,
        create_time
      FROM system_log
      ${whereClause}
      ORDER BY create_time DESC
      LIMIT ? OFFSET ?
    `;
    
    const [rows] = await db.promise().execute(query, [...params, parseInt(limit), offset]);
    
    res.json({
      success: true,
      data: {
        logs: rows,
        total: parseInt(total),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('获取系统日志失败:', error);
    res.status(500).json({ success: false, message: '获取系统日志失败' });
  }
});

// 获取系统统计（仅管理员）
router.get('/stats', authorize([3]), async (req, res) => {
  try {
    // 获取用户统计
    const [userStats] = await db.promise().execute(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN role = 1 THEN 1 ELSE 0 END) as normalUsers,
        SUM(CASE WHEN role = 2 THEN 1 ELSE 0 END) as guardians,
        SUM(CASE WHEN role = 3 THEN 1 ELSE 0 END) as admins
      FROM user_profile
    `);
    
    // 获取守护圈统计
    const [circleStats] = await db.promise().execute(`
      SELECT COUNT(*) as totalCircles
      FROM guardian_circle
    `);
    
    // 获取设备统计
    const [deviceStats] = await db.promise().execute(`
      SELECT 
        COUNT(*) as totalDevices,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as onlineDevices,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as offlineDevices
      FROM device_info
    `);
    
    // 获取事件统计
    const [eventStats] = await db.promise().execute(`
      SELECT 
        COUNT(*) as totalEvents,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as unhandledEvents,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as handledEvents,
        SUM(CASE WHEN create_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) as todayEvents
      FROM guardian_event
    `);
    
    // 获取最近登录统计
    const [loginStats] = await db.promise().execute(`
      SELECT 
        COUNT(DISTINCT user_id) as dailyActiveUsers
      FROM user_login
      WHERE login_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `);
    
    res.json({
      success: true,
      data: {
        users: userStats[0],
        circles: circleStats[0],
        devices: deviceStats[0],
        events: eventStats[0],
        activity: loginStats[0]
      }
    });
  } catch (error) {
    console.error('获取系统统计失败:', error);
    res.status(500).json({ success: false, message: '获取系统统计失败' });
  }
});

// 删除用户（仅超级管理员）
router.delete('/users/:userId', authorize([3]), async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.uid || req.user.id;
    
    // 不能删除自己
    if (parseInt(userId) === parseInt(adminId)) {
      return res.status(400).json({ success: false, message: '不能删除自己的账户' });
    }
    
    // 检查用户是否存在
    const [userRows] = await db.promise().execute(
      'SELECT id, role FROM user_profile WHERE id = ?',
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 不能删除其他管理员
    if (userRows[0].role === 3) {
      return res.status(400).json({ success: false, message: '不能删除管理员账户' });
    }
    
    // 开始事务
    await db.promise().execute('START TRANSACTION');
    
    try {
      // 删除用户相关数据
      await db.promise().execute('DELETE FROM user_login WHERE user_id = ?', [userId]);
      await db.promise().execute('DELETE FROM circle_member WHERE user_id = ?', [userId]);
      await db.promise().execute('DELETE FROM user_profile WHERE id = ?', [userId]);
      
      await db.promise().execute('COMMIT');
      
      res.json({ success: true, message: '用户删除成功' });
    } catch (error) {
      await db.promise().execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('删除用户失败:', error);
    res.status(500).json({ success: false, message: '删除用户失败' });
  }
});

// 重置用户密码（仅管理员）
router.post('/users/:userId/reset-password', authorize([3]), async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: '密码长度至少6位' });
    }
    
    // 检查用户是否存在
    const [userRows] = await db.promise().execute(
      'SELECT id FROM user_profile WHERE id = ?',
      [userId]
    );
    
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // 更新密码
    await db.promise().execute(
      'UPDATE user_profile SET password = ?, update_time = NOW() WHERE id = ?',
      [hashedPassword, userId]
    );
    
    res.json({ success: true, message: '密码重置成功' });
  } catch (error) {
    console.error('重置用户密码失败:', error);
    res.status(500).json({ success: false, message: '重置用户密码失败' });
  }
});

module.exports = router;