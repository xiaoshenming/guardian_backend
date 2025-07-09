// ./modle/guardian/alertUtil.js
import db from "../../config/db.js";

/**
 * @description (内部使用) 创建一条新的告警记录。通常由事件处理器根据事件严重性调用。
 * @param {object} alertData - { event_id, circle_id, alert_level, alert_content }
 * @returns {Promise<object>}
 */
async function createAlert(alertData) {
    const { event_id, circle_id, alert_level, alert_content } = alertData;
    const query = `
        INSERT INTO alert_log (event_id, circle_id, alert_level, alert_content, status)
        VALUES (?, ?, ?, ?, 0)
    `; // status 0: 待处理
    const [result] = await db.promise().query(query, [event_id, circle_id, alert_level, alert_content]);
    return { id: result.insertId, ...alertData };
}

/**
 * @description 根据守护圈ID分页获取告警记录
 * @param {number} circleId
 * @param {string} status - 'pending', 'acknowledged', 'all'
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<{alerts: Array, total: number}>}
 */
async function findAlertsByCircleId(circleId, status = 'pending', page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let statusClause = 'a.circle_id = ?';
    const params = [circleId];

    if (status === 'pending') {
        statusClause += ' AND a.status IN (0, 1)'; // 0:待处理, 1:已通知
    } else if (status === 'acknowledged') {
        statusClause += ' AND a.status > 1'; // 2:已确认, 3:已忽略
    }

    // 查询列表
    const query = `
        SELECT a.*, u.username AS acknowledged_by_username
        FROM alert_log a
        LEFT JOIN user_profile u ON a.acknowledged_by_uid = u.id
        WHERE ${statusClause}
        ORDER BY a.create_time DESC
        LIMIT ? OFFSET ?
    `;
    const [alerts] = await db.promise().query(query, [...params, limit, offset]);

    // 查询总数
    const countQuery = `SELECT COUNT(*) as total FROM alert_log a WHERE ${statusClause}`;
    const [countResult] = await db.promise().query(countQuery, params);

    return { alerts, total: countResult[0].total };
}

/**
 * @description 根据ID获取单个告警详情
 * @param {number} alertId
 * @returns {Promise<object|null>}
 */
async function findAlertById(alertId) {
    const query = `
        SELECT a.*, u.username AS acknowledged_by_username
        FROM alert_log a
                 LEFT JOIN user_profile u ON a.acknowledged_by_uid = u.id
        WHERE a.id = ?
    `;
    const [rows] = await db.promise().query(query, [alertId]);
    return rows[0] || null;
}

/**
 * @description 更新告警状态 (处理告警)
 * @param {number} alertId - 告警ID
 * @param {number} userId - 处理该告警的用户ID
 * @param {number} newStatus - 新的状态 (2:已确认, 3:已忽略)
 * @returns {Promise<boolean>}
 */
async function updateAlertStatus(alertId, newStatus, userId) {
    const query = `
        UPDATE alert_log 
        SET status = ?, acknowledged_by_uid = ?, acknowledged_time = NOW()
        WHERE id = ? AND status < 2 -- 只能处理未被处理的告警
    `;
    const [result] = await db.promise().query(query, [newStatus, userId, alertId]);
    return result.affectedRows > 0;
}

/**
 * @description 删除一条告警记录 (硬删除)
 * @param {number} alertId
 * @returns {Promise<boolean>}
 */
async function deleteAlertById(alertId) {
    const query = 'DELETE FROM alert_log WHERE id = ?';
    const [result] = await db.promise().query(query, [alertId]);
    return result.affectedRows > 0;
}

/**
 * @description 根据用户ID获取其所属所有圈子的告警记录
 * @param {number} userId - 用户ID
 * @param {string} status - 'pending', 'acknowledged', 'all'
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<{alerts: Array, total: number, circles: Array}>}
 */
async function findAlertsByUserId(userId, status = 'all', page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    let statusClause = '';
    const params = [userId];

    if (status === 'pending') {
        statusClause = ' AND a.status IN (0, 1)'; // 0:待处理, 1:已通知
    } else if (status === 'acknowledged') {
        statusClause = ' AND a.status > 1'; // 2:已确认, 3:已忽略
    }

    // 查询告警列表，包含圈子信息和设备信息
    const query = `
        SELECT 
            a.*,
            gc.circle_name,
            gc.creator_uid,
            d.device_name,
            u.username AS acknowledged_by_username
        FROM alert_log a
        JOIN guardian_circle gc ON a.circle_id = gc.id
        JOIN circle_member_map cmm ON gc.id = cmm.circle_id
        LEFT JOIN device_info d ON a.event_id IN (
            SELECT id FROM event_log WHERE device_id = d.id
        )
        LEFT JOIN user_profile u ON a.acknowledged_by_uid = u.id
        WHERE cmm.uid = ?${statusClause}
        ORDER BY a.create_time DESC
        LIMIT ? OFFSET ?
    `;
    const [alerts] = await db.promise().query(query, [...params, limit, offset]);

    // 查询总数
    const countQuery = `
        SELECT COUNT(DISTINCT a.id) as total 
        FROM alert_log a
        JOIN guardian_circle gc ON a.circle_id = gc.id
        JOIN circle_member_map cmm ON gc.id = cmm.circle_id
        WHERE cmm.uid = ?${statusClause}
    `;
    const [countResult] = await db.promise().query(countQuery, params);

    // 获取用户所属的圈子列表（用于前端筛选）
    const circlesQuery = `
        SELECT DISTINCT
            gc.id,
            gc.circle_name,
            gc.creator_uid,
            cmm.member_role
        FROM guardian_circle gc
        JOIN circle_member_map cmm ON gc.id = cmm.circle_id
        WHERE cmm.uid = ?
        ORDER BY cmm.member_role ASC, gc.create_time DESC
    `;
    const [circles] = await db.promise().query(circlesQuery, [userId]);

    return { 
        alerts, 
        total: countResult[0].total,
        circles
    };
}

/**
 * @description 获取系统所有告警记录（管理员专用）
 * @param {string} status - 'pending', 'acknowledged', 'all'
 * @param {number} page
 * @param {number} limit
 * @param {number} [circleId] - 可选的圈子ID筛选
 * @returns {Promise<{alerts: Array, total: number, circles: Array}>}
 */
async function findAllAlerts(status = 'all', page = 1, limit = 20, circleId = null) {
    const offset = (page - 1) * limit;
    let statusClause = '';
    let circleClause = '';
    const params = [];

    if (status === 'pending') {
        statusClause = ' AND a.status IN (0, 1)';
    } else if (status === 'acknowledged') {
        statusClause = ' AND a.status > 1';
    }

    if (circleId) {
        circleClause = ' AND a.circle_id = ?';
        params.push(circleId);
    }

    // 查询告警列表
    const query = `
        SELECT 
            a.*,
            gc.circle_name,
            gc.creator_uid,
            d.device_name,
            u.username AS acknowledged_by_username,
            creator.username AS circle_creator_name
        FROM alert_log a
        JOIN guardian_circle gc ON a.circle_id = gc.id
        LEFT JOIN device_info d ON a.event_id IN (
            SELECT id FROM event_log WHERE device_id = d.id
        )
        LEFT JOIN user_profile u ON a.acknowledged_by_uid = u.id
        LEFT JOIN user_profile creator ON gc.creator_uid = creator.id
        WHERE 1=1${statusClause}${circleClause}
        ORDER BY a.create_time DESC
        LIMIT ? OFFSET ?
    `;
    const [alerts] = await db.promise().query(query, [...params, limit, offset]);

    // 查询总数
    const countQuery = `
        SELECT COUNT(*) as total 
        FROM alert_log a
        WHERE 1=1${statusClause}${circleClause}
    `;
    const [countResult] = await db.promise().query(countQuery, params);

    // 获取所有圈子列表（用于前端筛选）
    const circlesQuery = `
        SELECT 
            gc.id,
            gc.circle_name,
            gc.creator_uid,
            creator.username AS creator_name,
            COUNT(a.id) as alert_count
        FROM guardian_circle gc
        LEFT JOIN alert_log a ON gc.id = a.circle_id
        LEFT JOIN user_profile creator ON gc.creator_uid = creator.id
        GROUP BY gc.id, gc.circle_name, gc.creator_uid, creator.username
        ORDER BY alert_count DESC, gc.create_time DESC
    `;
    const [circles] = await db.promise().query(circlesQuery);

    return { 
        alerts, 
        total: countResult[0].total,
        circles
    };
}

/**
 * @description 获取告警统计信息
 * @param {number} [userId] - 用户ID，如果提供则只统计该用户相关的圈子
 * @returns {Promise<object>} 返回统计信息
 */
async function getAlertStats(userId = null) {
    let whereClause = '';
    const params = [];

    if (userId) {
        whereClause = `
            WHERE a.circle_id IN (
                SELECT circle_id FROM circle_member_map WHERE uid = ?
            )
        `;
        params.push(userId);
    }

    const query = `
        SELECT 
            COUNT(*) as total_alerts,
            SUM(CASE WHEN a.status IN (0, 1) THEN 1 ELSE 0 END) as pending_alerts,
            SUM(CASE WHEN a.status = 2 THEN 1 ELSE 0 END) as acknowledged_alerts,
            SUM(CASE WHEN a.status = 3 THEN 1 ELSE 0 END) as ignored_alerts,
            COUNT(DISTINCT a.circle_id) as affected_circles
        FROM alert_log a
        ${whereClause}
    `;
    
    const [stats] = await db.promise().query(query, params);
    return stats[0];
}


export default {
    createAlert,
    findAlertsByCircleId,
    findAlertById,
    updateAlertStatus,
    deleteAlertById,
    findAlertsByUserId,
    findAllAlerts,
    getAlertStats
};
