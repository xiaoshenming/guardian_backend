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
async function updateAlertStatus(alertId, userId, newStatus) {
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


export default {
    createAlert,
    findAlertsByCircleId,
    findAlertById,
    updateAlertStatus,
    deleteAlertById
};
