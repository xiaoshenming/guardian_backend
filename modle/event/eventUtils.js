const db = require('../../config/db');

// 创建事件记录
const createEvent = async (eventData) => {
  const { deviceId, circleId, eventType, eventData: data, eventTime } = eventData;
  
  const query = `
    INSERT INTO events (device_id, circle_id, event_type, event_data, event_time, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `;
  
  const result = await db.execute(query, [
    deviceId,
    circleId,
    eventType,
    JSON.stringify(data),
    eventTime
  ]);
  
  return result && result[0] ? result[0].insertId : null;
};

// 获取守护圈的事件列表
const getCircleEvents = async (circleId, options = {}) => {
  const { page = 1, limit = 20, eventType, startDate, endDate } = options;
  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE e.circle_id = ?';
  let params = [circleId];
  
  if (eventType) {
    whereClause += ' AND e.event_type = ?';
    params.push(eventType);
  }
  
  if (startDate) {
    whereClause += ' AND e.event_time >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND e.event_time <= ?';
    params.push(endDate);
  }
  
  // 获取总数
  const countQuery = `
    SELECT COUNT(*) as total
    FROM event_log e
    ${whereClause}
  `;
  
  const countResult = await db.execute(countQuery, params);
  const total = countResult && countResult[0] && countResult[0][0] ? countResult[0][0].total : 0;
  
  // 获取事件列表
  const query = `
    SELECT 
      e.id,
      e.event_type,
      e.event_data,
      e.event_time,
      e.create_time,
      d.device_name,
      d.device_sn,
      d.device_model
    FROM event_log e
    LEFT JOIN device_info d ON e.device_id = d.id
    ${whereClause}
    ORDER BY e.event_time DESC
    LIMIT ? OFFSET ?
  `;
  
  params.push(limit, offset);
  const eventsResult = await db.execute(query, params);
  const events = eventsResult && eventsResult[0] ? eventsResult[0] : [];
  
  // 解析事件数据
  const parsedEvents = events.map(event => ({
    ...event,
    event_data: JSON.parse(event.event_data || '{}')
  }));
  
  return {
    events: parsedEvents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// 获取设备的事件列表
const getDeviceEvents = async (deviceId, options = {}) => {
  const { page = 1, limit = 20, eventType, startDate, endDate } = options;
  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE e.device_id = ?';
  let params = [deviceId];
  
  if (eventType) {
    whereClause += ' AND e.event_type = ?';
    params.push(eventType);
  }
  
  if (startDate) {
    whereClause += ' AND e.event_time >= ?';
    params.push(startDate);
  }
  
  if (endDate) {
    whereClause += ' AND e.event_time <= ?';
    params.push(endDate);
  }
  
  // 获取总数
  const countQuery = `
    SELECT COUNT(*) as total
    FROM event_log e
    ${whereClause}
  `;
  
  const countResult = await db.execute(countQuery, params);
  const countData = countResult && countResult[0] && countResult[0][0] ? countResult[0][0] : { total: 0 };
  const total = countData.total;
  
  // 获取事件列表
  const query = `
    SELECT 
      e.id,
      e.event_type,
      e.event_data,
      e.event_time,
      e.create_time
    FROM event_log e
    ${whereClause}
    ORDER BY e.event_time DESC
    LIMIT ? OFFSET ?
  `;
  
  params.push(limit, offset);
  const eventsResult = await db.execute(query, params);
  const events = eventsResult && eventsResult[0] ? eventsResult[0] : [];
  
  // 解析事件数据
  const parsedEvents = events.map(event => ({
    ...event,
    event_data: JSON.parse(event.event_data || '{}')
  }));
  
  return {
    events: parsedEvents,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// 获取事件详情
const getEventDetail = async (eventId) => {
  const query = `
    SELECT 
      e.id,
      e.device_id,
      e.circle_id,
      e.event_type,
      e.event_data,
      e.event_time,
      e.create_time,
      d.device_name,
      d.device_sn,
      d.device_model,
      c.circle_name
    FROM event_log e
    LEFT JOIN device_info d ON e.device_id = d.id
    LEFT JOIN guardian_circle c ON e.circle_id = c.id
    WHERE e.id = ?
  `;
  
  const result = await db.execute(query, [eventId]);
  const events = result && result[0] ? result[0] : [];
  
  if (!events || events.length === 0) {
    return null;
  }
  
  const event = events[0];
  return {
    ...event,
    event_data: JSON.parse(event.event_data || '{}')
  };
};

// 判断是否需要生成告警
const shouldGenerateAlert = async (eventType, eventData) => {
  // 定义需要告警的事件类型
  const alertEventTypes = [
    'emergency_button',    // 紧急按钮
    'fall_detected',       // 跌倒检测
    'heart_rate_abnormal', // 心率异常
    'location_sos',        // 位置求救
    'device_offline',      // 设备离线
    'low_battery',         // 电量低
    'fence_violation'      // 围栏违规
  ];
  
  if (!alertEventTypes.includes(eventType)) {
    return false;
  }
  
  // 根据事件类型和数据判断是否需要告警
  switch (eventType) {
    case 'heart_rate_abnormal':
      const heartRate = eventData.heart_rate;
      return heartRate < 50 || heartRate > 120;
    
    case 'low_battery':
      const battery = eventData.battery_level;
      return battery <= 20;
    
    case 'fence_violation':
      return eventData.violation_type === 'exit'; // 只有离开围栏才告警
    
    default:
      return true; // 其他类型默认告警
  }
};

// 获取告警级别
const getAlertLevel = (eventType) => {
  const alertLevels = {
    'emergency_button': 3,    // 紧急
    'fall_detected': 3,       // 紧急
    'location_sos': 3,        // 紧急
    'heart_rate_abnormal': 2, // 重要
    'fence_violation': 2,     // 重要
    'device_offline': 1,      // 一般
    'low_battery': 1          // 一般
  };
  
  return alertLevels[eventType] || 1;
};

// 生成告警内容
const generateAlertContent = (eventType, eventData, device) => {
  const deviceName = device.device_name || device.device_sn;
  
  const alertMessages = {
    'emergency_button': `设备 ${deviceName} 触发紧急按钮！`,
    'fall_detected': `设备 ${deviceName} 检测到跌倒事件！`,
    'location_sos': `设备 ${deviceName} 发出位置求救信号！`,
    'heart_rate_abnormal': `设备 ${deviceName} 检测到心率异常：${eventData.heart_rate} BPM`,
    'fence_violation': `设备 ${deviceName} 违反围栏规则：${eventData.violation_type === 'exit' ? '离开安全区域' : '进入禁止区域'}`,
    'device_offline': `设备 ${deviceName} 已离线`,
    'low_battery': `设备 ${deviceName} 电量不足：${eventData.battery_level}%`
  };
  
  return alertMessages[eventType] || `设备 ${deviceName} 发生 ${eventType} 事件`;
};

// 生成告警
const generateAlert = async (alertData) => {
  const { eventId, circleId, alertLevel, alertContent } = alertData;
  
  const query = `
    INSERT INTO alert_log (event_id, circle_id, alert_level, alert_content, status, create_time)
    VALUES (?, ?, ?, ?, 0, NOW())
  `;
  
  const insertResult = await db.execute(query, [
    eventId,
    circleId,
    alertLevel,
    alertContent
  ]);
  
  return insertResult && insertResult[0] ? insertResult[0].insertId : null;
};

// 获取守护圈的告警列表
const getCircleAlerts = async (circleId, options = {}) => {
  const { page = 1, limit = 20, status, alertLevel } = options;
  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE a.circle_id = ?';
  let params = [circleId];
  
  if (status !== undefined) {
    whereClause += ' AND a.status = ?';
    params.push(status);
  }
  
  if (alertLevel !== undefined) {
    whereClause += ' AND a.alert_level = ?';
    params.push(alertLevel);
  }
  
  // 获取总数
  const countQuery = `
    SELECT COUNT(*) as total
    FROM alert_log a
    ${whereClause}
  `;
  
  const [countResult] = await db.execute(countQuery, params);
  const total = countResult[0].total;
  
  // 获取告警列表
  const query = `
    SELECT 
      a.id,
      a.event_id,
      a.alert_level,
      a.alert_content,
      a.status,
      a.acknowledged_by_uid,
      a.acknowledged_time,
      a.create_time,
      e.event_type,
      e.event_time,
      d.device_name,
      d.device_sn,
      u.username as acknowledged_by_name
    FROM alert_log a
    LEFT JOIN event_log e ON a.event_id = e.id
    LEFT JOIN device_info d ON e.device_id = d.id
    LEFT JOIN user_profile u ON a.acknowledged_by_uid = u.id
    ${whereClause}
    ORDER BY a.create_time DESC
    LIMIT ? OFFSET ?
  `;
  
  params.push(limit, offset);
  const alertsResult = await db.execute(query, params);
  const alerts = alertsResult && alertsResult[0] ? alertsResult[0] : [];
  
  return {
    alerts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// 获取告警详情
const getAlertById = async (alertId) => {
  const query = `
    SELECT 
      a.*,
      e.event_type,
      e.event_time,
      e.event_data,
      d.device_name,
      d.device_sn
    FROM alert_log a
    LEFT JOIN event_log e ON a.event_id = e.id
    LEFT JOIN device_info d ON e.device_id = d.id
    WHERE a.id = ?
  `;
  
  const alertsResult = await db.execute(query, [alertId]);
  const alerts = alertsResult && alertsResult[0] ? alertsResult[0] : [];
  
  if (alerts.length === 0) {
    return null;
  }
  
  const alert = alerts[0];
  return {
    ...alert,
    event_data: JSON.parse(alert.event_data || '{}')
  };
};

// 确认告警
const acknowledgeAlert = async (alertId, userId) => {
  const query = `
    UPDATE alert_log 
    SET status = 1, acknowledged_by_uid = ?, acknowledged_time = NOW()
    WHERE id = ?
  `;
  
  await db.execute(query, [userId, alertId]);
};

// 获取事件统计
const getEventStats = async (circleId, period = 'today') => {
  let dateCondition = '';
  
  switch (period) {
    case 'today':
      dateCondition = 'AND DATE(e.event_time) = CURDATE()';
      break;
    case 'week':
      dateCondition = 'AND e.event_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      break;
    case 'month':
      dateCondition = 'AND e.event_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
      break;
  }
  
  // 事件类型统计
  const eventTypeQuery = `
    SELECT 
      e.event_type,
      COUNT(*) as count
    FROM event_log e
    WHERE e.circle_id = ? ${dateCondition}
    GROUP BY e.event_type
    ORDER BY count DESC
  `;
  
  const eventTypeResult = await db.execute(eventTypeQuery, [circleId]);
  const eventTypeStats = eventTypeResult && eventTypeResult[0] ? eventTypeResult[0] : [];
  
  // 告警级别统计
  const alertLevelQuery = `
    SELECT 
      a.alert_level,
      COUNT(*) as count,
      SUM(CASE WHEN a.status = 0 THEN 1 ELSE 0 END) as unacknowledged
    FROM alert_log a
    JOIN event_log e ON a.event_id = e.id
    WHERE a.circle_id = ? ${dateCondition}
    GROUP BY a.alert_level
  `;
  
  const alertLevelResult = await db.execute(alertLevelQuery, [circleId]);
  const alertLevelStats = alertLevelResult && alertLevelResult[0] ? alertLevelResult[0] : [];
  
  // 设备活跃度统计
  const deviceActivityQuery = `
    SELECT 
      d.device_name,
      d.device_sn,
      COUNT(e.id) as event_count,
      MAX(e.event_time) as last_event_time
    FROM device_info d
    LEFT JOIN event_log e ON d.id = e.device_id ${dateCondition.replace('e.event_time', 'e.event_time')}
    WHERE d.circle_id = ?
    GROUP BY d.id, d.device_name, d.device_sn
    ORDER BY event_count DESC
  `;
  
  const deviceActivityResult = await db.execute(deviceActivityQuery, [circleId]);
  const deviceActivityStats = deviceActivityResult && deviceActivityResult[0] ? deviceActivityResult[0] : [];
  
  // 总体统计
  const overallQuery = `
    SELECT 
      COUNT(DISTINCT e.id) as total_events,
      COUNT(DISTINCT a.id) as total_alerts,
      COUNT(DISTINCT CASE WHEN a.status = 0 THEN a.id END) as unacknowledged_alerts,
      COUNT(DISTINCT e.device_id) as active_devices
    FROM event_log e
    LEFT JOIN alert_log a ON e.id = a.event_id
    WHERE e.circle_id = ? ${dateCondition}
  `;
  
  const overallResult = await db.execute(overallQuery, [circleId]);
  const overallStats = overallResult && overallResult[0] ? overallResult[0] : [];
  
  return {
    period,
    overall: overallStats[0],
    eventTypes: eventTypeStats,
    alertLevels: alertLevelStats,
    deviceActivity: deviceActivityStats
  };
};

// 获取告警统计信息
const getAlertStats = async (circleId) => {
  const query = `
    SELECT 
      COUNT(CASE WHEN alert_level >= 3 AND DATE(create_time) = CURDATE() THEN 1 END) as urgent_today,
      COUNT(CASE WHEN alert_level >= 3 AND DATE(create_time) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as urgent_week,
      COUNT(CASE WHEN status = 0 THEN 1 END) as unacknowledged,
      COUNT(*) as total
    FROM alert_log 
    WHERE circle_id = ?
  `;
  
  const result = await db.execute(query, [circleId]);
  return result && result[0] && result[0][0] ? result[0][0] : {
    urgent_today: 0,
    urgent_week: 0,
    unacknowledged: 0,
    total: 0
  };
};

// 获取最近事件列表
const getRecentEvents = async (options = {}) => {
  const { circleIds, limit = 10, eventType } = options;
  
  if (!circleIds || circleIds.length === 0) {
    return [];
  }
  
  let whereClause = `WHERE e.circle_id IN (${circleIds.map(() => '?').join(',')})`;
  let params = [...circleIds];
  
  if (eventType) {
    whereClause += ' AND e.event_type = ?';
    params.push(eventType);
  }
  
  const query = `
    SELECT 
      e.id,
      e.event_type,
      e.event_data,
      e.event_time,
      e.create_time,
      d.device_name,
      d.device_sn,
      d.device_model,
      gc.circle_name
    FROM event_log e
    LEFT JOIN device_info d ON e.device_id = d.id
    LEFT JOIN guardian_circle gc ON e.circle_id = gc.id
    ${whereClause}
    ORDER BY e.event_time DESC
    LIMIT ?
  `;
  
  params.push(limit);
  const result = await db.execute(query, params);
  const events = result && result[0] ? result[0] : [];
  
  // 解析事件数据
  return events.map(event => ({
    ...event,
    event_data: JSON.parse(event.event_data || '{}')
  }));
};

// 获取所有事件列表（支持多个守护圈）
const getAllEvents = async (options = {}) => {
  const { circleIds, page = 1, limit = 10, status } = options;
  const offset = (page - 1) * limit;
  
  if (!circleIds || circleIds.length === 0) {
    return { list: [], total: 0 };
  }
  
  const placeholders = circleIds.map(() => '?').join(',');
  let whereClause = `WHERE a.circle_id IN (${placeholders})`;
  let params = [...circleIds];
  
  if (status !== undefined) {
    whereClause += ' AND a.status = ?';
    params.push(status);
  }
  
  // 获取总数
  const countQuery = `
    SELECT COUNT(*) as total
    FROM alert_log a
    ${whereClause}
  `;
  
  const [countResult] = await db.execute(countQuery, params);
  const total = countResult && countResult[0] ? countResult[0].total : 0;
  
  // 获取列表数据
  const listQuery = `
    SELECT 
      a.id,
      a.event_id,
      a.circle_id,
      a.alert_level,
      a.alert_content,
      a.status,
      a.acknowledged_by_uid,
      a.acknowledged_time,
      a.create_time,
      c.circle_name as circle_name,
      e.event_type,
      e.event_data,
      d.device_name,
      d.device_sn
    FROM alert_log a
    LEFT JOIN guardian_circle c ON a.circle_id = c.id
    LEFT JOIN event_log e ON a.event_id = e.id
    LEFT JOIN device_info d ON e.device_id = d.id
    ${whereClause}
    ORDER BY a.create_time DESC
    LIMIT ? OFFSET ?
  `;
  
  const [listResult] = await db.execute(listQuery, [...params, limit, offset]);
  
  return {
    list: listResult || [],
    total
  };
};

// 处理单个告警
const handleAlert = async (alertId, userId, options = {}) => {
  const { status = 'handled', note } = options;
  
  const query = `
    UPDATE alert_log 
    SET status = 1, acknowledged_by_uid = ?, acknowledged_time = NOW()
    WHERE id = ?
  `;
  
  const [result] = await db.execute(query, [userId, alertId]);
  return result.affectedRows > 0;
};

// 批量处理告警
const batchHandleAlerts = async (alertIds, userId, options = {}) => {
  const { status = 'handled', note } = options;
  
  if (!alertIds || alertIds.length === 0) {
    return { processed: 0, failed: 0 };
  }
  
  let processed = 0;
  let failed = 0;
  
  for (const alertId of alertIds) {
    try {
      const success = await handleAlert(alertId, userId, { status, note });
      if (success) {
        processed++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`处理告警 ${alertId} 失败:`, error);
      failed++;
    }
  }
  
  return { processed, failed };
};

// 获取未处理事件数量
const getUnhandledEventCount = async (circleIds) => {
  if (!circleIds || circleIds.length === 0) {
    return 0;
  }
  
  const placeholders = circleIds.map(() => '?').join(',');
  
  const query = `
    SELECT COUNT(*) as count
    FROM alert_log a
    WHERE a.circle_id IN (${placeholders})
    AND a.status = 0
    AND a.create_time >= CURDATE()
  `;
  
  const [result] = await db.execute(query, circleIds);
  return result && result[0] ? result[0].count : 0;
};

module.exports = {
  createEvent,
  getCircleEvents,
  getDeviceEvents,
  getEventDetail,
  shouldGenerateAlert,
  getAlertLevel,
  generateAlertContent,
  generateAlert,
  getCircleAlerts,
  getAlertById,
  acknowledgeAlert,
  getEventStats,
  getAlertStats,
  getRecentEvents,
  getAllEvents,
  handleAlert,
  batchHandleAlerts,
  getUnhandledEventCount
};