import db from "../../config/db.js";

/**
 * @description 通过邀请码将用户加入守护圈
 * @param {string} circleCode - 守护圈的邀请码
 * @param {number} uid - 要加入圈子的用户ID
 * @param {string} [alias] - 用户在圈内的昵称 (可选, 默认为用户主档案的昵称)
 * @returns {Promise<object>} 返回新的成员关系信息
 */
async function joinCircleByCode(circleCode, uid, alias) {
    // 1. 根据邀请码查找圈子
    const [circles] = await db.promise().query('SELECT id FROM guardian_circle WHERE circle_code = ?', [circleCode]);
    if (circles.length === 0) {
        const error = new Error('邀请码无效或守护圈不存在');
        error.statusCode = 404;
        throw error;
    }
    const circleId = circles[0].id;

    // 2. 检查用户是否已在该圈子中
    const [existingMembers] = await db.promise().query('SELECT id FROM circle_member_map WHERE circle_id = ? AND uid = ?', [circleId, uid]);
    if (existingMembers.length > 0) {
        const error = new Error('您已经是该守护圈的成员，请勿重复加入');
        error.statusCode = 409; // 409 Conflict
        throw error;
    }

    // 3. 如果未提供昵称，从 user_profile 获取
    let memberAlias = alias;
    if (!memberAlias) {
        const [profiles] = await db.promise().query('SELECT username FROM user_profile WHERE id = ?', [uid]);
        memberAlias = profiles.length > 0 ? profiles[0].username : `成员${uid}`;
    }

    // 4. 插入新的成员记录
    const memberRole = 1; // 默认为普通成员
    const alertLevel = 1; // 默认接收所有告警
    const query = 'INSERT INTO circle_member_map (circle_id, uid, member_role, member_alias, alert_level) VALUES (?, ?, ?, ?, ?)';
    const [result] = await db.promise().query(query, [circleId, uid, memberRole, memberAlias, alertLevel]);

    return {
        id: result.insertId,
        circle_id: circleId,
        uid: uid,
        member_role: memberRole,
        member_alias: memberAlias
    };
}


/**
 * @description 获取指定守护圈的所有成员列表，并包含用户的详细信息
 * @param {number} circleId - 守护圈ID
 * @returns {Promise<Array>}
 */
async function findMembersByCircleId(circleId) {
    const query = `
        SELECT 
            cmm.id AS member_map_id,
            cmm.uid,
            cmm.member_role,
            cmm.member_alias,
            cmm.alert_level,
            cmm.create_time,
            up.username,
            up.avatar_url
        FROM circle_member_map AS cmm
        LEFT JOIN user_profile AS up ON cmm.uid = up.id
        WHERE cmm.circle_id = ?
        ORDER BY cmm.member_role ASC, cmm.create_time ASC
    `;
    const [members] = await db.promise().query(query, [circleId]);
    return members;
}

/**
 * @description 根据成员关系ID获取单个成员的信息
 * @param {number} memberMapId - circle_member_map 表的主键 ID
 * @returns {Promise<object|null>}
 */
async function findMemberByMapId(memberMapId) {
    const query = `
        SELECT cmm.*, gc.creator_uid 
        FROM circle_member_map cmm
        JOIN guardian_circle gc ON cmm.circle_id = gc.id
        WHERE cmm.id = ?
    `;
    const [rows] = await db.promise().query(query, [memberMapId]);
    return rows[0] || null;
}

/**
 * @description 获取指定用户在指定圈子里的成员信息(用于权限判断)
 * @param {number} uid - 用户ID
 * @param {number} circleId - 圈子ID
 * @returns {Promise<object|null>}
 */
async function getMembership(uid, circleId) {
    const query = 'SELECT * FROM circle_member_map WHERE uid = ? AND circle_id = ?';
    const [rows] = await db.promise().query(query, [uid, circleId]);
    return rows[0] || null;
}

/**
 * @description 获取指定用户所属的所有守护圈列表
 * @param {number} uid - 用户ID
 * @returns {Promise<Array>} 返回用户所属的所有圈子信息
 */
async function findCirclesByUserId(uid) {
    const query = `
        SELECT 
            gc.id,
            gc.circle_name,
            gc.description,
            gc.creator_uid,
            gc.circle_code,
            gc.create_time,
            cmm.member_role,
            cmm.member_alias,
            cmm.alert_level
        FROM circle_member_map cmm
        JOIN guardian_circle gc ON cmm.circle_id = gc.id
        WHERE cmm.uid = ?
        ORDER BY cmm.member_role ASC, gc.create_time DESC
    `;
    const [circles] = await db.promise().query(query, [uid]);
    return circles;
}

/**
 * @description 更新成员信息 (昵称、角色、告警级别)
 * @param {number} memberMapId - circle_member_map 表的主键 ID
 * @param {object} dataToUpdate - { member_alias, member_role, alert_level }
 * @returns {Promise<boolean>}
 */
async function updateMember(memberMapId, { member_alias, member_role, alert_level }) {
    // 构建动态更新查询
    const fields = [];
    const values = [];

    if (member_alias !== undefined) {
        fields.push('member_alias = ?');
        values.push(member_alias);
    }
    if (member_role !== undefined) {
        fields.push('member_role = ?');
        values.push(member_role);
    }
    if (alert_level !== undefined) {
        fields.push('alert_level = ?');
        values.push(alert_level);
    }

    if (fields.length === 0) {
        return false; // 没有需要更新的字段
    }

    const query = `UPDATE circle_member_map SET ${fields.join(', ')} WHERE id = ?`;
    values.push(memberMapId);

    const [result] = await db.promise().query(query, values);
    return result.affectedRows > 0;
}


/**
 * @description 从守护圈中移除一个成员
 * @param {number} memberMapId - circle_member_map 表的主键 ID
 * @returns {Promise<boolean>}
 */
async function removeMember(memberMapId) {
    const query = 'DELETE FROM circle_member_map WHERE id = ?';
    const [result] = await db.promise().query(query, [memberMapId]);
    return result.affectedRows > 0;
}


export default {
    joinCircleByCode,
    findMembersByCircleId,
    findMemberByMapId,
    getMembership,
    findCirclesByUserId,
    updateMember,
    removeMember
};
