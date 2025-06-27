const db = require('../../config/db');

/**
 * 通过设备序列号查找设备
 */
async function findDeviceBySn(deviceSn) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM device_info WHERE device_sn = ?';
    db.query(query, [deviceSn], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * 绑定设备到守护圈
 */
async function bindDevice(deviceData) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO device_info (
        device_sn, device_name, device_model, circle_id, 
        bound_by_uid, device_status, firmware_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    db.query(query, [
      deviceData.deviceSn,
      deviceData.deviceName,
      deviceData.deviceModel || 'Hi3516',
      deviceData.circleId,
      deviceData.boundByUid,
      0, // 初始状态：未激活
      deviceData.firmwareVersion || '1.0.0'
    ], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results.insertId);
      }
    });
  });
}

/**
 * 通过ID获取设备信息
 */
async function getDeviceById(deviceId) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM device_info WHERE id = ?';
    db.query(query, [deviceId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * 获取守护圈的设备列表
 */
async function getCircleDevices(circleId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        di.*,
        up.username as bound_by_name,
        CASE 
          WHEN di.last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1
          WHEN di.last_heartbeat IS NULL THEN 0
          ELSE 2
        END as real_status
      FROM device_info di
      LEFT JOIN user_profile up ON di.bound_by_uid = up.id
      WHERE di.circle_id = ?
      ORDER BY di.create_time DESC
    `;
    
    db.query(query, [circleId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 获取设备详细信息（包括最近事件）
 */
async function getDeviceDetail(deviceId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        di.*,
        up.username as bound_by_name,
        gc.circle_name,
        CASE 
          WHEN di.last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1
          WHEN di.last_heartbeat IS NULL THEN 0
          ELSE 2
        END as real_status,
        (
          SELECT COUNT(*) FROM event_log el 
          WHERE el.device_id = di.id AND DATE(el.create_time) = CURDATE()
        ) as today_events,
        (
          SELECT el.event_time FROM event_log el 
          WHERE el.device_id = di.id 
          ORDER BY el.event_time DESC LIMIT 1
        ) as last_event_time
      FROM device_info di
      LEFT JOIN user_profile up ON di.bound_by_uid = up.id
      LEFT JOIN guardian_circle gc ON di.circle_id = gc.id
      WHERE di.id = ?
    `;
    
    db.query(query, [deviceId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * 更新设备配置
 */
async function updateDeviceConfig(deviceId, configData) {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE device_info 
      SET device_name = ?, config = ?, update_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    db.query(query, [
      configData.deviceName,
      JSON.stringify(configData.config),
      deviceId
    ], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 解绑设备
 */
async function unbindDevice(deviceId) {
  return new Promise((resolve, reject) => {
    // 开启事务，同时删除设备和相关事件记录
    db.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }
      
      connection.beginTransaction((err) => {
        if (err) {
          connection.release();
          reject(err);
          return;
        }
        
        // 删除相关事件记录
        connection.query(
          'DELETE FROM event_log WHERE device_id = ?',
          [deviceId],
          (err) => {
            if (err) {
              connection.rollback(() => {
                connection.release();
                reject(err);
              });
              return;
            }
            
            // 删除设备记录
            connection.query(
              'DELETE FROM device_info WHERE id = ?',
              [deviceId],
              (err, results) => {
                if (err) {
                  connection.rollback(() => {
                    connection.release();
                    reject(err);
                  });
                  return;
                }
                
                connection.commit((err) => {
                  if (err) {
                    connection.rollback(() => {
                      connection.release();
                      reject(err);
                    });
                    return;
                  }
                  
                  connection.release();
                  resolve(results);
                });
              }
            );
          }
        );
      });
    });
  });
}

/**
 * 更新设备心跳
 */
async function updateDeviceHeartbeat(deviceSn, heartbeatData) {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE device_info 
      SET 
        last_heartbeat = CURRENT_TIMESTAMP,
        device_status = ?,
        firmware_version = COALESCE(?, firmware_version),
        update_time = CURRENT_TIMESTAMP
      WHERE device_sn = ?
    `;
    
    db.query(query, [
      heartbeatData.status,
      heartbeatData.firmwareVersion,
      deviceSn
    ], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 获取设备状态统计
 */
async function getDeviceStats(circleId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        COUNT(*) as total_devices,
        SUM(CASE WHEN last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) as online_devices,
        SUM(CASE WHEN last_heartbeat IS NULL OR last_heartbeat <= DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) as offline_devices,
        SUM(CASE WHEN device_status = 3 THEN 1 ELSE 0 END) as fault_devices,
        (
          SELECT COUNT(*) FROM event_log el 
          JOIN device_info di ON el.device_id = di.id 
          WHERE di.circle_id = ? AND DATE(el.create_time) = CURDATE()
        ) as today_events
      FROM device_info 
      WHERE circle_id = ?
    `;
    
    db.query(query, [circleId, circleId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        const stats = results[0] || {
          total_devices: 0,
          online_devices: 0,
          offline_devices: 0,
          fault_devices: 0,
          today_events: 0
        };
        resolve(stats);
      }
    });
  });
}

/**
 * 批量更新离线设备状态
 */
async function updateOfflineDevices() {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE device_info 
      SET device_status = 2, update_time = CURRENT_TIMESTAMP
      WHERE last_heartbeat < DATE_SUB(NOW(), INTERVAL 10 MINUTE) 
      AND device_status = 1
    `;
    
    db.query(query, (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

module.exports = {
  findDeviceBySn,
  bindDevice,
  getDeviceById,
  getCircleDevices,
  getDeviceDetail,
  updateDeviceConfig,
  unbindDevice,
  updateDeviceHeartbeat,
  getDeviceStats,
  updateOfflineDevices
};