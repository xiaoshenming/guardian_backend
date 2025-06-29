// ./modle/guardian/smartHomeDeviceUtil.js
import db from "../../config/db.js";

/**
 * @description 向守护圈添加一个新的第三方智能设备
 * @param {object} deviceData - { device_name, circle_id, protocol, api_endpoint, status }
 * @returns {Promise<object>} 新添加的设备信息
 */
async function addSmartDevice(deviceData) {
    const { device_name, circle_id, protocol, api_endpoint, status } = deviceData;
    const query = `
        INSERT INTO smart_home_device (device_name, circle_id, protocol, api_endpoint, status)
        VALUES (?, ?, ?, ?, ?)
    `;
    const statusJson = typeof status === 'object' ? JSON.stringify(status) : status;
    const [result] = await db.promise().query(query, [device_name, circle_id, protocol, api_endpoint, statusJson]);
    return { id: result.insertId, ...deviceData };
}

/**
 * @description 查找指定守护圈下的所有智能设备
 * @param {number} circleId - 守护圈ID
 * @returns {Promise<Array>}
 */
async function findSmartDevicesByCircleId(circleId) {
    const query = 'SELECT * FROM smart_home_device WHERE circle_id = ? ORDER BY create_time DESC';
    const [rows] = await db.promise().query(query, [circleId]);
    return rows;
}

/**
 * @description 更新智能设备信息
 * @param {number} deviceId - 智能设备ID
 * @param {object} dataToUpdate - { device_name, protocol, api_endpoint, status }
 * @returns {Promise<boolean>}
 */
async function updateSmartDevice(deviceId, dataToUpdate) {
    const { device_name, protocol, api_endpoint, status } = dataToUpdate;
    // 确保 status 总是 JSON 字符串
    const statusJson = status ? (typeof status === 'object' ? JSON.stringify(status) : status) : undefined;

    const fields = [];
    const values = [];

    if (device_name !== undefined) { fields.push('device_name = ?'); values.push(device_name); }
    if (protocol !== undefined) { fields.push('protocol = ?'); values.push(protocol); }
    if (api_endpoint !== undefined) { fields.push('api_endpoint = ?'); values.push(api_endpoint); }
    if (statusJson !== undefined) { fields.push('status = ?'); values.push(statusJson); }

    if (fields.length === 0) return false;

    const query = `UPDATE smart_home_device SET ${fields.join(', ')} WHERE id = ?`;
    values.push(deviceId);

    const [result] = await db.promise().query(query, values);
    return result.affectedRows > 0;
}

/**
 * @description 从系统中移除一个智能设备
 * @param {number} deviceId - 智能设备ID
 * @returns {Promise<boolean>}
 */
async function removeSmartDevice(deviceId) {
    const query = 'DELETE FROM smart_home_device WHERE id = ?';
    const [result] = await db.promise().query(query, [deviceId]);
    return result.affectedRows > 0;
}

export default {
    addSmartDevice,
    findSmartDevicesByCircleId,
    updateSmartDevice,
    removeSmartDevice,
};
