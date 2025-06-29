const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const authorize = require('../auth/authUtils');
const circleUtils = require('../circle/circleUtils');

// 获取设备状态统计
router.get('/device-stats', authorize([1, 2, 3]), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    const { circleId, timeRange = '7d' } = req.query;
    
    let whereClause = '';
    let params = [];
    
    if (circleId) {
      // 验证用户是否有权限访问该守护圈
      const isMember = await circleUtils.isCircleMember(userId, circleId);
      if (!isMember) {
        return res.status(403).json({ success: false, message: '无权限访问该守护圈' });
      }
      whereClause = 'WHERE d.circle_id = ?';
      params.push(circleId);
    } else {
      // 获取用户所有守护圈的设备
      const userCircles = await circleUtils.getUserCircles(userId);
      const circleIds = userCircles.map(circle => circle.id);
      if (circleIds.length === 0) {
        return res.json({ success: true, data: { online: 0, offline: 0, warning: 0, batteryLow: 0 } });
      }
      whereClause = `WHERE d.circle_id IN (${circleIds.map(() => '?').join(',')})`;
      params = circleIds;
    }
    
    const query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN d.last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) as online,
        SUM(CASE WHEN d.last_heartbeat IS NULL OR d.last_heartbeat <= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) as offline,
        SUM(CASE WHEN d.device_status = 3 THEN 1 ELSE 0 END) as warning,
        0 as batteryLow
      FROM device_info d
      ${whereClause}
    `;
    
    const [rows] = await db.promise().execute(query, params);
    const stats = rows[0];
    
    res.json({
      success: true,
      data: {
        online: parseInt(stats.online) || 0,
        offline: parseInt(stats.offline) || 0,
        warning: parseInt(stats.warning) || 0,
        batteryLow: parseInt(stats.batteryLow) || 0,
        total: parseInt(stats.total) || 0
      }
    });
  } catch (error) {
    console.error('获取设备状态统计失败:', error);
    res.status(500).json({ success: false, message: '获取设备状态统计失败' });
  }
});

// 获取事件趋势数据
router.get('/event-trends', authorize([1, 2, 3]), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    const { circleId, startDate, endDate, granularity = 'day' } = req.query;
    
    // 设置默认时间范围（最近7天）
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let whereClause = 'WHERE e.create_time BETWEEN ? AND ?';
    let params = [start, end];
    
    if (circleId) {
      // 验证用户是否有权限访问该守护圈
      const isMember = await circleUtils.isCircleMember(userId, circleId);
      if (!isMember) {
        return res.status(403).json({ success: false, message: '无权限访问该守护圈' });
      }
      whereClause += ' AND e.circle_id = ?';
      params.push(circleId);
    } else {
      // 获取用户所有守护圈的事件
      const userCircles = await circleUtils.getUserCircles(userId);
      const circleIds = userCircles.map(circle => circle.id);
      if (circleIds.length === 0) {
        return res.json({ success: true, data: { dates: [], counts: [], types: {} } });
      }
      whereClause += ` AND e.circle_id IN (${circleIds.map(() => '?').join(',')})`;
      params = params.concat(circleIds);
    }
    
    // 根据粒度设置日期格式
    let dateFormat = '%Y-%m-%d';
    if (granularity === 'hour') {
      dateFormat = '%Y-%m-%d %H:00:00';
    } else if (granularity === 'month') {
      dateFormat = '%Y-%m';
    }
    
    const query = `
      SELECT 
        DATE_FORMAT(e.create_time, '${dateFormat}') as date,
        COUNT(*) as count,
        e.event_type
      FROM guardian_event e
      ${whereClause}
      GROUP BY DATE_FORMAT(e.create_time, '${dateFormat}'), e.event_type
      ORDER BY date
    `;
    
    const [rows] = await db.promise().execute(query, params);
    
    // 处理数据格式
    const dateMap = new Map();
    const typeMap = new Map();
    
    rows.forEach(row => {
      const date = row.date;
      const type = row.event_type;
      const count = parseInt(row.count);
      
      if (!dateMap.has(date)) {
        dateMap.set(date, 0);
      }
      dateMap.set(date, dateMap.get(date) + count);
      
      if (!typeMap.has(type)) {
        typeMap.set(type, new Map());
      }
      typeMap.get(type).set(date, count);
    });
    
    const dates = Array.from(dateMap.keys()).sort();
    const counts = dates.map(date => dateMap.get(date) || 0);
    
    const types = {};
    typeMap.forEach((dateCountMap, type) => {
      types[type] = dates.map(date => dateCountMap.get(date) || 0);
    });
    
    res.json({
      success: true,
      data: {
        dates,
        counts,
        types
      }
    });
  } catch (error) {
    console.error('获取事件趋势数据失败:', error);
    res.status(500).json({ success: false, message: '获取事件趋势数据失败' });
  }
});

// 获取用户活跃度统计
router.get('/user-activity', authorize([1, 2, 3]), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    const { circleId, timeRange = '7d' } = req.query;
    
    // 计算时间范围
    const days = parseInt(timeRange.replace('d', '')) || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    let whereClause = 'WHERE ul.login_time >= ?';
    let params = [startDate];
    
    if (circleId) {
      // 验证用户是否有权限访问该守护圈
      const isMember = await circleUtils.isCircleMember(userId, circleId);
      if (!isMember) {
        return res.status(403).json({ success: false, message: '无权限访问该守护圈' });
      }
      
      // 获取守护圈成员的活跃度
      whereClause += ' AND cm.circle_id = ?';
      params.push(circleId);
      
      const query = `
        SELECT 
          DATE_FORMAT(ul.login_time, '%Y-%m-%d') as date,
          COUNT(DISTINCT ul.user_id) as activeUsers,
          COUNT(*) as totalLogins
        FROM user_login ul
        JOIN circle_member cm ON ul.user_id = cm.user_id
        ${whereClause}
        GROUP BY DATE_FORMAT(ul.login_time, '%Y-%m-%d')
        ORDER BY date
      `;
      
      const [rows] = await db.promise().execute(query, params);
      
      res.json({
        success: true,
        data: {
          dailyActivity: rows,
          totalActiveUsers: rows.reduce((sum, row) => sum + parseInt(row.activeUsers), 0),
          totalLogins: rows.reduce((sum, row) => sum + parseInt(row.totalLogins), 0)
        }
      });
    } else {
      // 获取用户自己的活跃度
      const query = `
        SELECT 
          DATE_FORMAT(login_time, '%Y-%m-%d') as date,
          COUNT(*) as loginCount
        FROM user_login
        WHERE user_id = ? AND login_time >= ?
        GROUP BY DATE_FORMAT(login_time, '%Y-%m-%d')
        ORDER BY date
      `;
      
      const [rows] = await db.promise().execute(query, [userId, startDate]);
      
      res.json({
        success: true,
        data: {
          dailyActivity: rows,
          totalLogins: rows.reduce((sum, row) => sum + parseInt(row.loginCount), 0)
        }
      });
    }
  } catch (error) {
    console.error('获取用户活跃度统计失败:', error);
    res.status(500).json({ success: false, message: '获取用户活跃度统计失败' });
  }
});

// 获取设备健康度报告
router.get('/device-health', authorize([1, 2, 3]), async (req, res) => {
  try {
    const userId = req.user.uid || req.user.id;
    const { circleId } = req.query;
    
    let whereClause = '';
    let params = [];
    
    if (circleId) {
      // 验证用户是否有权限访问该守护圈
      const isMember = await circleUtils.isCircleMember(userId, circleId);
      if (!isMember) {
        return res.status(403).json({ success: false, message: '无权限访问该守护圈' });
      }
      whereClause = 'WHERE d.circle_id = ?';
      params.push(circleId);
    } else {
      // 获取用户所有守护圈的设备
      const userCircles = await circleUtils.getUserCircles(userId);
      const circleIds = userCircles.map(circle => circle.id);
      if (circleIds.length === 0) {
        return res.json({ success: true, data: { devices: [], summary: { healthy: 0, warning: 0, critical: 0 } } });
      }
      whereClause = `WHERE d.circle_id IN (${circleIds.map(() => '?').join(',')})`;
      params = circleIds;
    }
    
    const query = `
      SELECT 
        d.id,
        d.device_name,
        d.device_model as device_type,
        d.device_status,
        0 as battery_level,
        100 as signal_strength,
        d.last_heartbeat,
        0 as alert_level,
        CASE 
          WHEN d.device_status = 0 OR d.last_heartbeat < DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 'critical'
          WHEN d.device_status = 3 THEN 'warning'
          ELSE 'healthy'
        END as health_status
      FROM device_info d
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN d.device_status = 0 OR d.last_heartbeat < DATE_SUB(NOW(), INTERVAL 1 HOUR) THEN 1
          WHEN d.device_status = 3 THEN 2
          ELSE 3
        END,
        d.device_name
    `;
    
    const [rows] = await db.promise().execute(query, params);
    
    const summary = {
      healthy: 0,
      warning: 0,
      critical: 0
    };
    
    rows.forEach(device => {
      summary[device.health_status]++;
    });
    
    res.json({
      success: true,
      data: {
        devices: rows,
        summary
      }
    });
  } catch (error) {
    console.error('获取设备健康度报告失败:', error);
    res.status(500).json({ success: false, message: '获取设备健康度报告失败' });
  }
});

module.exports = router;