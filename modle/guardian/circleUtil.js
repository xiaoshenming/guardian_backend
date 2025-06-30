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
    // ... (此部分代码无需修改，保持原样)
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

// ... (findCircleById, findCirclesByCreatorId, findAllCircles, updateCircle, deleteCircle 函数保持原样)
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
 * @description 根据创建者ID查找其创建的所有守护圈 (已三次修复)
 * @param {number} creatorUid - 创建者用户ID (login_verification.id)
 * @returns {Promise<Array>} 返回守护圈列表，包含创建者信息、成员数和设备数
 */
async function findCirclesByCreatorId(creatorUid) {
    const query = `
        SELECT
            gc.*,
            up.username AS creator_name,
            up.email AS creator_email,
            COUNT(DISTINCT cmm.id) AS member_count,
            COUNT(DISTINCT di.id) AS device_count
        FROM
            guardian_circle AS gc
                LEFT JOIN
            login_verification AS lv ON gc.creator_uid = lv.id
                LEFT JOIN
            user_profile AS up ON lv.uid = up.id
                LEFT JOIN
            circle_member_map AS cmm ON gc.id = cmm.circle_id
                LEFT JOIN
            device_info AS di ON gc.id = di.circle_id
        WHERE
            gc.creator_uid = ?
        GROUP BY
            gc.id
        ORDER BY
            gc.create_time DESC
    `;
    const [rows] = await db.promise().query(query, [creatorUid]);
    return rows;
}

/**
 * @description 获取所有守护圈（管理员权限） (已三次修复)
 * @returns {Promise<Array>} 返回所有守护圈的列表，包含创建者信息、成员数和设备数
 */
async function findAllCircles() {
    const query = `
        SELECT
            gc.*,
            up.username AS creator_name,
            up.email AS creator_email,
            COUNT(DISTINCT cmm.id) AS member_count,
            COUNT(DISTINCT di.id) AS device_count
        FROM
            guardian_circle AS gc
                LEFT JOIN
            login_verification AS lv ON gc.creator_uid = lv.id
                LEFT JOIN
            user_profile AS up ON lv.uid = up.id
                LEFT JOIN
            circle_member_map AS cmm ON gc.id = cmm.circle_id
                LEFT JOIN
            device_info AS di ON gc.id = di.circle_id
        GROUP BY
            gc.id
        ORDER BY
            gc.create_time DESC
    `;
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


/**
 * @description 获取仪表盘统计数据 (已修复)
 * @param {number} userId - 用户ID
 * @param {number} userRole - 用户角色 (1: 普通用户, 2: 管理员)
 * @returns {Promise<object>} 返回统计数据
 */
async function getDashboardStats(userId, userRole) {
    try {
        const stats = {
            totalCircles: 0,
            totalMembers: 0,
            totalDevices: 0,
            totalAlerts: 0,
            activeDevices: 0,
            pendingAlerts: 0,
            myCircles: 0,
            todayEvents: 0
        };

        // 首先，无论什么角色，都获取“我创建的圈子”数量
        const [myCircleStats] = await db.promise().query('SELECT COUNT(*) as count FROM guardian_circle WHERE creator_uid = ?', [userId]);
        stats.myCircles = myCircleStats[0].count;

        if (userRole >= 2) {
            // 管理员: 查看全局数据
            const [circleStats] = await db.promise().query('SELECT COUNT(*) as count FROM guardian_circle');
            stats.totalCircles = circleStats[0].count;

            const [memberStats] = await db.promise().query('SELECT COUNT(*) as count FROM circle_member_map');
            stats.totalMembers = memberStats[0].count;

            const [deviceStats] = await db.promise().query('SELECT COUNT(*) as count FROM device_info');
            stats.totalDevices = deviceStats[0].count;

            const [activeDeviceStats] = await db.promise().query('SELECT COUNT(*) as count FROM device_info WHERE last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE)');
            stats.activeDevices = activeDeviceStats[0].count;

            const [alertStats] = await db.promise().query('SELECT COUNT(*) as count FROM alert_log');
            stats.totalAlerts = alertStats[0].count;

            const [pendingAlertStats] = await db.promise().query('SELECT COUNT(*) as count FROM alert_log WHERE status = 0'); // 待处理状态为 0
            stats.pendingAlerts = pendingAlertStats[0].count;

            const [todayEventStats] = await db.promise().query('SELECT COUNT(*) as count FROM event_log WHERE DATE(event_time) = CURDATE()');
            stats.todayEvents = todayEventStats[0].count;

        } else {
            // 普通用户: 查看自己参与的所有圈子的数据
            // 获取用户参与的所有圈子ID
            const [userCircles] = await db.promise().query('SELECT DISTINCT circle_id FROM circle_member_map WHERE uid = ?', [userId]);
            const circleIds = userCircles.map(row => row.circle_id);

            stats.totalCircles = circleIds.length; // 圈子总数是用户参与的圈子数

            if (circleIds.length > 0) {
                const placeholders = circleIds.map(() => '?').join(',');

                const [memberStats] = await db.promise().query(`SELECT COUNT(*) as count FROM circle_member_map WHERE circle_id IN (${placeholders})`, circleIds);
                stats.totalMembers = memberStats[0].count;

                const [deviceStats] = await db.promise().query(`SELECT COUNT(*) as count FROM device_info WHERE circle_id IN (${placeholders})`, circleIds);
                stats.totalDevices = deviceStats[0].count;

                const [activeDeviceStats] = await db.promise().query(`SELECT COUNT(*) as count FROM device_info WHERE circle_id IN (${placeholders}) AND last_heartbeat > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`, circleIds);
                stats.activeDevices = activeDeviceStats[0].count;

                const [alertStats] = await db.promise().query(`SELECT COUNT(*) as count FROM alert_log WHERE circle_id IN (${placeholders})`, circleIds);
                stats.totalAlerts = alertStats[0].count;

                const [pendingAlertStats] = await db.promise().query(`SELECT COUNT(*) as count FROM alert_log WHERE circle_id IN (${placeholders}) AND status = 0`, [...circleIds]); // 待处理状态为 0
                stats.pendingAlerts = pendingAlertStats[0].count;

                const [todayEventStats] = await db.promise().query(`SELECT COUNT(*) as count FROM event_log WHERE circle_id IN (${placeholders}) AND DATE(event_time) = CURDATE()`, circleIds);
                stats.todayEvents = todayEventStats[0].count;
            }
        }

        return stats;
    } catch (error) {
        throw new Error('获取仪表盘统计数据失败: ' + error.message);
    }
}


/**
 * @description 获取仪表盘图表数据 (已修复)
 * @param {number} userId - 用户ID
 * @param {number} userRole - 用户角色 (1: 普通用户, 2: 管理员)
 * @returns {Promise<object>} 返回图表数据
 */
async function getDashboardCharts(userId, userRole) {
    try {
        const chartData = {
            alertTrend: [],
            deviceStatus: [],
            circleActivity: [],
            alertTypes: [],
            memberGrowth: []
        };

        // 1. 根据角色获取需要查询的圈子ID列表
        let circleIds = [];
        if (userRole >= 2) { // 管理员获取所有圈子ID
            const [allCircles] = await db.promise().query('SELECT id FROM guardian_circle');
            circleIds = allCircles.map(row => row.id);
        } else { // 普通用户获取自己参与的圈子ID
            const [userCircles] = await db.promise().query('SELECT DISTINCT circle_id FROM circle_member_map WHERE uid = ?', [userId]);
            circleIds = userCircles.map(row => row.circle_id);
        }

        if (circleIds.length === 0) {
            return chartData; // 如果没有任何相关圈子，直接返回空数据
        }

        const placeholders = circleIds.map(() => '?').join(',');

        // 2. 并行执行所有图表查询
        const [
            alertTrendData,
            deviceStatusData,
            circleActivityData,
            alertTypesData,
            memberGrowthData
        ] = await Promise.all([
            // 告警趋势（最近7天）
            db.promise().query(`
                SELECT DATE(create_time) as date, COUNT(*) as value
                FROM alert_log
                WHERE circle_id IN (${placeholders}) AND create_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DATE(create_time)
                ORDER BY date ASC
            `, circleIds),
            // 设备状态分布
            db.promise().query(`
                SELECT 
                    CASE 
                        WHEN device_status = 1 THEN '在线'
                        WHEN device_status = 2 THEN '离线'
                        ELSE '异常'
                    END as name,
                    COUNT(*) as value
                FROM device_info 
                WHERE circle_id IN (${placeholders})
                GROUP BY name
            `, circleIds),
            // 圈子活跃度（基于事件数量）
            db.promise().query(`
                SELECT gc.circle_name as name, COUNT(el.id) as value
                FROM event_log el
                JOIN guardian_circle gc ON el.circle_id = gc.id
                WHERE el.circle_id IN (${placeholders}) AND el.event_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                GROUP BY el.circle_id, gc.circle_name
                ORDER BY value DESC
                LIMIT 10
            `, circleIds),
            // 告警类型分布 (修复: 关联 event_log 获取 event_type)
            db.promise().query(`
                SELECT el.event_type as name, COUNT(al.id) as value
                FROM alert_log al
                JOIN event_log el ON al.event_id = el.id
                WHERE al.circle_id IN (${placeholders}) AND al.create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY el.event_type
                ORDER BY value DESC
            `, circleIds),
            // 成员增长趋势（最近30天）(修复: 使用 create_time)
            db.promise().query(`
                SELECT DATE(create_time) as date, COUNT(*) as value
                FROM circle_member_map 
                WHERE circle_id IN (${placeholders}) AND create_time >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY DATE(create_time)
                ORDER BY date ASC
            `, circleIds)
        ]);

        chartData.alertTrend = alertTrendData[0];
        chartData.deviceStatus = deviceStatusData[0];
        chartData.circleActivity = circleActivityData[0];
        chartData.alertTypes = alertTypesData[0];
        chartData.memberGrowth = memberGrowthData[0];

        return chartData;
    } catch (error) {
        throw new Error('获取仪表盘图表数据失败: ' + error.message);
    }
}


export {
    createCircle,
    findCircleById,
    findCirclesByCreatorId,
    findAllCircles,
    updateCircle,
    deleteCircle,
    getDashboardStats,
    getDashboardCharts
};

export default {
    createCircle,
    findCircleById,
    findCirclesByCreatorId,
    findAllCircles,
    updateCircle,
    deleteCircle,
    getDashboardStats,
    getDashboardCharts
};
