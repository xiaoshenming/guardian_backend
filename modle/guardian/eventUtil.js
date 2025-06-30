// ./modle/guardian/eventUtil.js
import db from "../../config/db.js";

/**
 * @description (内部使用) 创建一条新的事件日志。此函数由 MQTT 处理器调用。
 * @param {object} eventData - { device_id, circle_id, event_type, event_data, event_time }
 * @returns {Promise<object>}
 */
async function createEventLog(eventData) {
    const { device_id, circle_id, event_type, event_data, event_time } = eventData;
    const query = `
        INSERT INTO event_log (device_id, circle_id, event_type, event_data, event_time)
        VALUES (?, ?, ?, ?, ?)
    `;
    // event_data 可能是对象，确保以JSON字符串存入
    const dataJson = typeof event_data === 'object' ? JSON.stringify(event_data) : event_data;
    const [result] = await db.promise().query(query, [device_id, circle_id, event_type, dataJson, event_time]);
    return { id: result.insertId, ...eventData };
}

/**
 * @description 根据守护圈ID分页获取事件日志
 * @param {number} circleId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<{events: Array, total: number}>} 返回事件列表和总数
 */
async function findEventsByCircleId(circleId, page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    // 查询列表
    const query = `
        SELECT e.*, d.device_name
        FROM event_log e
                 LEFT JOIN device_info d ON e.device_id = d.id
        WHERE e.circle_id = ?
        ORDER BY e.event_time DESC
            LIMIT ? OFFSET ?
    `;
    const [events] = await db.promise().query(query, [circleId, limit, offset]);

    // 查询总数
    const countQuery = 'SELECT COUNT(*) as total FROM event_log WHERE circle_id = ?';
    const [countResult] = await db.promise().query(countQuery, [circleId]);

    return { events, total: countResult[0].total };
}

/**
 * @description 根据ID获取单个事件详情
 * @param {number} eventId
 * @returns {Promise<object|null>}
 */
async function findEventById(eventId) {
    const query = `
        SELECT e.*, d.device_name 
        FROM event_log e
        LEFT JOIN device_info d ON e.device_id = d.id
        WHERE e.id = ?
    `;
    const [rows] = await db.promise().query(query, [eventId]);
    return rows[0] || null;
}

/**
 * @description 删除一条事件日志 (硬删除)
 * @param {number} eventId
 * @returns {Promise<boolean>}
 */
async function deleteEventById(eventId) {
    const query = 'DELETE FROM event_log WHERE id = ?';
    const [result] = await db.promise().query(query, [eventId]);
    return result.affectedRows > 0;
}

export default {
    createEventLog,
    findEventsByCircleId,
    findEventById,
    deleteEventById
};
