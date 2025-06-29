// ./modle/guardian/actionRuleUtil.js
import db from "../../config/db.js";

/**
 * @description 创建一条新的自动化规则
 * @param {object} ruleData
 * @returns {Promise<object>}
 */
async function createRule(ruleData) {
    const { rule_name, circle_id, trigger_device_id, trigger_event_type, condition_logic, action_type, action_params, is_enabled } = ruleData;
    const query = `
        INSERT INTO action_rule (rule_name, circle_id, trigger_device_id, trigger_event_type, condition_logic, action_type, action_params, is_enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const conditionJson = typeof condition_logic === 'object' ? JSON.stringify(condition_logic) : null;
    const paramsJson = typeof action_params === 'object' ? JSON.stringify(action_params) : null;

    const [result] = await db.promise().query(query, [rule_name, circle_id, trigger_device_id, trigger_event_type, conditionJson, action_type, paramsJson, is_enabled ?? 1]);
    return { id: result.insertId, ...ruleData };
}

/**
 * @description 查找指定守护圈下的所有规则
 * @param {number} circleId
 * @returns {Promise<Array>}
 */
async function findRulesByCircleId(circleId) {
    const query = 'SELECT * FROM action_rule WHERE circle_id = ? ORDER BY create_time DESC';
    const [rows] = await db.promise().query(query, [circleId]);
    return rows;
}

// ... updateRule 和 deleteRule 的实现与 smartHomeDeviceUtil 类似，是标准的更新和删除 ...

export default {
    createRule,
    findRulesByCircleId,
    // ... updateRule, deleteRule
};
