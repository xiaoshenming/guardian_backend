import db from "../../config/db.js";

/**
 * @description 绑定一个新设备到指定的守护圈
 * @param {object} deviceData - 设备信息 { device_sn, device_name, device_model, config }
 * @param {number} circleId - 守护圈ID
 * @param {number} boundByUid - 执行绑定操作的用户ID
 * @returns {Promise<object>} 返回新绑定的设备信息
 */
async function bindDeviceToCircle(deviceData, circleId, boundByUid) {
    const { device_sn, device_name, device_model, config } = deviceData;

    // --- 修复点：在这里对 config 进行 JSON 格式化 ---
    // 确保无论 config 是一个对象还是未定义，都能安全地存入数据库
    // 如果 config 存在，则将其字符串化；如果不存在，则使用 null，这会被数据库正确地存为 NULL
    const configJson = config ? JSON.stringify(config) : null;
    // --- 修复结束 ---

    // 1. 检查设备SN是否已经被其他圈子绑定
    const [existingDevices] = await db.promise().query('SELECT id, circle_id FROM device_info WHERE device_sn = ?', [device_sn]);
    if (existingDevices.length > 0 && existingDevices[0].circle_id !== null) {
        const error = new Error('该设备已被其他守护圈绑定，请先解绑');
        error.statusCode = 409; // Conflict
        throw error;
    }

    let deviceId;
    if (existingDevices.length > 0) {
        // 更新现有未绑定的设备
        deviceId = existingDevices[0].id;
        const updateQuery = `
            UPDATE device_info
            SET device_name = ?, circle_id = ?, bound_by_uid = ?, device_status = 1, config = ?, last_heartbeat = NOW()
            WHERE id = ?
        `;
        // 在 UPDATE 查询中也使用格式化后的 configJson
        await db.promise().query(updateQuery, [device_name, circleId, boundByUid, configJson, deviceId]);
    } else {
        // 插入全新设备
        const insertQuery = `
            INSERT INTO device_info (device_sn, device_name, device_model, config, circle_id, bound_by_uid, device_status, last_heartbeat)
            VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
        `;
        // 在 INSERT 查询中使用格式化后的 configJson
        const [result] = await db.promise().query(insertQuery, [device_sn, device_name, device_model, configJson, circleId, boundByUid]);
        deviceId = result.insertId;
    }

    // 返回完整的设备信息
    return findDeviceById(deviceId);
}


/**
 * @description 根据守护圈ID查找其下所有设备
 * @param {number} circleId - 守护圈ID
 * @returns {Promise<Array>} 设备列表
 */
async function findDevicesByCircleId(circleId) {
    const query = `
        SELECT 
            d.id, d.device_sn, d.device_name, d.device_model, 
            d.device_status, d.firmware_version, d.last_heartbeat,
            d.bound_by_uid, up.username AS bound_by_username,
            d.create_time
        FROM device_info AS d
        LEFT JOIN user_profile AS up ON d.bound_by_uid = up.id
        WHERE d.circle_id = ?
        ORDER BY d.create_time DESC
    `;
    const [devices] = await db.promise().query(query, [circleId]);
    return devices;
}


/**
 * @description 根据设备ID查找设备详情
 * @param {number} deviceId - 设备主键ID
 * @returns {Promise<object|null>} 设备详情，包含圈主ID用于权限判断
 */
async function findDeviceById(deviceId) {
    const query = `
        SELECT d.*, gc.creator_uid
        FROM device_info d
        LEFT JOIN guardian_circle gc ON d.circle_id = gc.id
        WHERE d.id = ?
    `;
    const [rows] = await db.promise().query(query, [deviceId]);
    return rows[0] || null;
}


/**
 * @description 更新设备信息 (如名称, 配置)
 * @param {number} deviceId - 设备ID
 * @param {object} dataToUpdate - { device_name, config }
 * @returns {Promise<boolean>}
 */
async function updateDeviceInfo(deviceId, { device_name, config }) {
    const fields = [];
    const values = [];

    if (device_name !== undefined) {
        fields.push('device_name = ?');
        values.push(device_name);
    }
    if (config !== undefined) {
        fields.push('config = ?');
        values.push(JSON.stringify(config)); // 确保JSON被正确存储
    }

    if (fields.length === 0) return false;

    const query = `UPDATE device_info SET ${fields.join(', ')} WHERE id = ?`;
    values.push(deviceId);

    const [result] = await db.promise().query(query, values);
    return result.affectedRows > 0;
}


/**
 * @description 从守护圈解绑一个设备 (软删除)
 * @param {number} deviceId - 设备ID
 * @returns {Promise<boolean>}
 */
async function unbindDeviceFromCircle(deviceId) {
    const query = `
        UPDATE device_info 
        SET circle_id = NULL, bound_by_uid = NULL, device_status = 0
        WHERE id = ?
    `;
    const [result] = await db.promise().query(query, [deviceId]);
    return result.affectedRows > 0;
}
// /**
//  * @description 根据设备SN查找设备详情 (新增函数)
//  * @param {string} deviceSn - 设备的唯一序列号
//  * @returns {Promise<object|null>} 设备详情，包含关键的 circle_id
//  */
// async function findDeviceBySn(deviceSn) {
//     // 我们只需要查询最关键的信息，以提高效率
//     const query = 'SELECT id, device_sn, circle_id, device_status FROM device_info WHERE device_sn = ?';
//     const [rows] = await db.promise().query(query, [deviceSn]);
//     return rows[0] || null;
// }

/**
 * @description (内部使用) 通过 SN 查找设备，这是 MQTT 处理器验证设备合法性的关键
 * @param {string} deviceSn - 设备序列号
 * @returns {Promise<object|null>}
 */
async function findDeviceBySn(deviceSn) {
    const query = 'SELECT * FROM device_info WHERE device_sn = ?';
    const [rows] = await db.promise().query(query, [deviceSn]);
    return rows[0] || null;
}


/**
 * @description (内部使用) 更新设备的心跳和在线状态
 * @param {string} deviceSn - 设备序列号
 * @param {string} firmwareVersion - 从心跳包中获取的固件版本
 * @returns {Promise<boolean>}
 */
async function updateDeviceHeartbeat(deviceSn, firmwareVersion) {
    const query = `
        UPDATE device_info 
        SET 
            last_heartbeat = NOW(), 
            device_status = 1,  -- 1: 在线
            firmware_version = ?
        WHERE device_sn = ?
    `;
    const [result] = await db.promise().query(query, [firmwareVersion, deviceSn]);
    return result.affectedRows > 0;
}

/**
 * @description (内部使用) 更新设备的状态配置 (config 字段)
 * @param {string} deviceSn - 设备序列号
 * @param {object} stateData - 从 state 消息中收到的状态对象
 * @returns {Promise<boolean>}
 */
async function updateDeviceState(deviceSn, stateData) {
    const configJson = JSON.stringify(stateData);
    const query = 'UPDATE device_info SET config = ? WHERE device_sn = ?';
    const [result] = await db.promise().query(query, [configJson, deviceSn]);
    return result.affectedRows > 0;
}


export default {
    bindDeviceToCircle,
    findDevicesByCircleId,
    findDeviceById,
    updateDeviceInfo,
    unbindDeviceFromCircle,
    findDeviceBySn,
    updateDeviceHeartbeat,
    updateDeviceState
};
