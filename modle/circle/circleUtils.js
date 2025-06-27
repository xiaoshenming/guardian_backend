const db = require('../../config/db');
const crypto = require('crypto');

/**
 * 生成唯一的守护圈邀请码
 */
async function generateUniqueCircleCode() {
  let isUnique = false;
  let circleCode;
  
  while (!isUnique) {
    // 生成8位随机字符串
    circleCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // 检查是否已存在
    const existing = await findCircleByCode(circleCode);
    if (!existing) {
      isUnique = true;
    }
  }
  
  return circleCode;
}

/**
 * 创建守护圈
 */
async function createCircle(circleData) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO guardian_circle (circle_name, creator_uid, circle_code, description)
      VALUES (?, ?, ?, ?)
    `;
    
    db.query(query, [
      circleData.circleName,
      circleData.creatorUid,
      circleData.circleCode,
      circleData.description
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
 * 通过邀请码查找守护圈
 */
async function findCircleByCode(circleCode) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM guardian_circle WHERE circle_code = ?';
    db.query(query, [circleCode], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * 添加成员到守护圈
 */
async function addMemberToCircle(circleId, uid, memberRole, memberAlias) {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO circle_member_map (circle_id, uid, member_role, member_alias)
      VALUES (?, ?, ?, ?)
    `;
    
    db.query(query, [circleId, uid, memberRole, memberAlias], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results.insertId);
      }
    });
  });
}

/**
 * 检查用户是否是守护圈成员
 */
async function checkMembership(circleId, uid) {
  return new Promise((resolve, reject) => {
    const query = 'SELECT * FROM circle_member_map WHERE circle_id = ? AND uid = ?';
    db.query(query, [circleId, uid], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * 获取用户的守护圈列表
 */
async function getUserCircles(uid) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        gc.*,
        cmm.member_role,
        cmm.member_alias,
        cmm.alert_level,
        up.username as creator_name
      FROM guardian_circle gc
      JOIN circle_member_map cmm ON gc.id = cmm.circle_id
      LEFT JOIN user_profile up ON gc.creator_uid = up.id
      WHERE cmm.uid = ?
      ORDER BY gc.create_time DESC
    `;
    
    db.query(query, [uid], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 获取守护圈详情
 */
async function getCircleDetail(circleId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        gc.*,
        up.username as creator_name,
        up.avatar_url as creator_avatar
      FROM guardian_circle gc
      LEFT JOIN user_profile up ON gc.creator_uid = up.id
      WHERE gc.id = ?
    `;
    
    db.query(query, [circleId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
}

/**
 * 获取守护圈成员列表
 */
async function getCircleMembers(circleId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        cmm.*,
        up.username,
        up.avatar_url,
        up.email,
        up.phone_number,
        up.last_login_time
      FROM circle_member_map cmm
      LEFT JOIN user_profile up ON cmm.uid = up.id
      WHERE cmm.circle_id = ?
      ORDER BY cmm.member_role ASC, cmm.create_time ASC
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
 * 更新成员角色
 */
async function updateMemberRole(circleId, uid, memberRole, memberAlias) {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE circle_member_map 
      SET member_role = ?, member_alias = ?, update_time = CURRENT_TIMESTAMP
      WHERE circle_id = ? AND uid = ?
    `;
    
    db.query(query, [memberRole, memberAlias, circleId, uid], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 从守护圈移除成员
 */
async function removeMemberFromCircle(circleId, uid) {
  return new Promise((resolve, reject) => {
    const query = 'DELETE FROM circle_member_map WHERE circle_id = ? AND uid = ?';
    
    db.query(query, [circleId, uid], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 获取守护圈统计信息
 */
async function getCircleStats(circleId) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        COUNT(DISTINCT cmm.uid) as member_count,
        COUNT(DISTINCT di.id) as device_count,
        COUNT(DISTINCT el.id) as event_count_today
      FROM guardian_circle gc
      LEFT JOIN circle_member_map cmm ON gc.id = cmm.circle_id
      LEFT JOIN device_info di ON gc.id = di.circle_id
      LEFT JOIN event_log el ON gc.id = el.circle_id AND DATE(el.create_time) = CURDATE()
      WHERE gc.id = ?
      GROUP BY gc.id
    `;
    
    db.query(query, [circleId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0] || { member_count: 0, device_count: 0, event_count_today: 0 });
      }
    });
  });
}

module.exports = {
  generateUniqueCircleCode,
  createCircle,
  findCircleByCode,
  addMemberToCircle,
  checkMembership,
  getUserCircles,
  getCircleDetail,
  getCircleMembers,
  updateMemberRole,
  removeMemberFromCircle,
  getCircleStats
};