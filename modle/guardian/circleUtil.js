// circleUtil.js
import db from "../../config/db.js";
import { customAlphabet } from 'nanoid';

/**
 * @description 生成一个唯一的、6位、不含模糊字符的守护圈邀请码
 * @returns {string} 6位邀请码
 */
const generateCircleCode = () => {
    // 使用不含 0oO1lI 等易混淆字符的字母和数字
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const nanoid = customAlphabet(alphabet, 6);
    return nanoid();
};

/**
 * @description 创建一个新的守护圈，并自动将创建者设为圈主。
 * 此操作在一个事务中完成。
 * @param {object} circleData - 守护圈数据，包含 { circle_name, description }
 * @param {number} creatorUid - 创建者的用户ID (对应 user_profile.id)
 * @returns {Promise<object>} 返回新创建的守护圈信息
 */
async function createCircle(circleData, creatorUid) {
    return new Promise((resolve, reject) => {
        db.getConnection((err, connection) => {
            if (err) {
                return reject(new Error("获取数据库连接失败"));
            }

            connection.beginTransaction(async (err) => {
                if (err) {
                    connection.release();
                    return reject(new Error("启动事务失败"));
                }

                try {
                    // 1. 生成一个唯一的邀请码
                    let circleCode;
                    let isCodeUnique = false;
                    while (!isCodeUnique) {
                        circleCode = generateCircleCode();
                        const [rows] = await connection.promise().query('SELECT id FROM guardian_circle WHERE circle_code = ?', [circleCode]);
                        if (rows.length === 0) {
                            isCodeUnique = true;
                        }
                    }

                    // 2. 在 guardian_circle 表中插入新圈子
                    const circleQuery = 'INSERT INTO guardian_circle (circle_name, description, creator_uid, circle_code) VALUES (?, ?, ?, ?)';
                    const [circleResult] = await connection.promise().query(circleQuery, [
                        circleData.circle_name,
                        circleData.description,
                        creatorUid,
                        circleCode
                    ]);
                    const circleId = circleResult.insertId;

                    // 3. 在 circle_member_map 表中将创建者添加为圈主
                    const memberQuery = 'INSERT INTO circle_member_map (circle_id, uid, member_role, member_alias) VALUES (?, ?, ?, ?)';
                    const [profile] = await connection.promise().query('SELECT username FROM user_profile WHERE id = ?', [creatorUid]);
                    const creatorAlias = profile.length > 0 ? profile[0].username : '圈主';
                    await connection.promise().query(memberQuery, [
                        circleId,
                        creatorUid,
                        0, // 0: 圈主/管理员
                        creatorAlias
                    ]);

                    // 4. 提交事务
                    connection.commit((err) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                reject(new Error("提交事务失败: " + err.message));
                            });
                        }
                        connection.release();
                        resolve({
                            id: circleId,
                            circle_name: circleData.circle_name,
                            description: circleData.description,
                            creator_uid: creatorUid,
                            circle_code: circleCode
                        });
                    });

                } catch (error) {
                    // 如果任何步骤出错，回滚事务
                    connection.rollback(() => {
                        connection.release();
                        reject(new Error("创建守护圈事务失败: " + error.message));
                    });
                }
            });
        });
    });
}

/**
 * @description 根据圈子ID查找守护圈信息
 * @param {number} circleId - 守护圈ID
 * @returns {Promise<object|null>} 返回圈子信息或 null
 */
async function findCircleById(circleId) {
    const query = 'SELECT * FROM guardian_circle WHERE id = ?';
    const [rows] = await db.promise().query(query, [circleId]);
    return rows[0] || null;
}

/**
 * @description 根据创建者ID查找其创建的所有守护圈
 * @param {number} creatorUid - 创建者用户ID
 * @returns {Promise<Array>} 返回守护圈列表
 */
async function findCirclesByCreatorId(creatorUid) {
    const query = 'SELECT * FROM guardian_circle WHERE creator_uid = ? ORDER BY create_time DESC';
    const [rows] = await db.promise().query(query, [creatorUid]);
    return rows;
}

/**
 * @description 获取所有守护圈（管理员权限）
 * @returns {Promise<Array>} 返回所有守护圈的列表
 */
async function findAllCircles() {
    const query = `
        SELECT gc.*, up.username as creator_name 
        FROM guardian_circle gc
        LEFT JOIN user_profile up ON gc.creator_uid = up.id
        ORDER BY gc.create_time DESC`;
    const [rows] = await db.promise().query(query);
    return rows;
}

/**
 * @description 更新指定ID的守护圈信息
 * @param {number} circleId - 守护圈ID
 * @param {object} updateData - 需要更新的数据 { circle_name, description }
 * @returns {Promise<boolean>} 如果更新成功返回 true
 */
async function updateCircle(circleId, updateData) {
    const { circle_name, description } = updateData;
    // 只允许更新名称和描述
    const query = 'UPDATE guardian_circle SET circle_name = ?, description = ? WHERE id = ?';
    const [result] = await db.promise().query(query, [circle_name, description, circleId]);
    return result.affectedRows > 0;
}

/**
 * @description 删除一个守护圈及其所有关联数据（成员、设备解绑等）。
 * 此操作在一个事务中完成，确保数据一致性。
 * @param {number} circleId - 要删除的守护圈ID
 * @returns {Promise<boolean>} 如果删除成功返回 true
 */
async function deleteCircle(circleId) {
    return new Promise((resolve, reject) => {
        db.getConnection((err, connection) => {
            if (err) {
                return reject(new Error("获取数据库连接失败"));
            }

            connection.beginTransaction(async (err) => {
                if (err) {
                    connection.release();
                    return reject(new Error("启动事务失败"));
                }

                try {
                    // 1. 删除圈子下的所有成员关系
                    await connection.promise().query('DELETE FROM circle_member_map WHERE circle_id = ?', [circleId]);

                    // 2. 解绑圈子下的所有硬件设备 (设置为 circle_id = NULL)
                    // 这样做比直接删除设备更安全，设备可以被重新绑定
                    await connection.promise().query('UPDATE device_info SET circle_id = NULL WHERE circle_id = ?', [circleId]);

                    // 3. 删除圈子下的所有自动化规则
                    await connection.promise().query('DELETE FROM action_rule WHERE circle_id = ?', [circleId]);

                    // 4. 删除圈子本身
                    const [deleteResult] = await connection.promise().query('DELETE FROM guardian_circle WHERE id = ?', [circleId]);

                    // 5. 提交事务
                    connection.commit((err) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                reject(new Error("提交删除事务失败: " + err.message));
                            });
                        }
                        connection.release();
                        resolve(deleteResult.affectedRows > 0);
                    });

                } catch (error) {
                    connection.rollback(() => {
                        connection.release();
                        reject(new Error("删除守护圈事务失败: " + error.message));
                    });
                }
            });
        });
    });
}


export {
    createCircle,
    findCircleById,
    findCirclesByCreatorId,
    findAllCircles,
    updateCircle,
    deleteCircle
};

export default {
    createCircle,
    findCircleById,
    findCirclesByCreatorId,
    findAllCircles,
    updateCircle,
    deleteCircle
};
