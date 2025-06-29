// ./modle/guardian/actionRuleRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import actionRuleUtil from './actionRuleUtil.js';
import circleUtil from './circleUtil.js';

const router = express.Router();

/**
 * @api {POST} /api/guardian/circle/:circleId/rules - 创建自动化规则
 * @description 只有圈主或管理员可以创建规则。
 * @permission 圈主或管理员
 */
router.post('/circle/:circleId/rules', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;

        // 权限校验：必须是圈主或管理员
        if (role < 2) {
            const circle = await circleUtil.findCircleById(circleId);
            if (!circle || circle.creator_uid !== userId) {
                return res.status(403).json({ code: 403, message: '权限不足，只有圈主才能创建规则', data: null, error: null });
            }
        }

        const newRule = await actionRuleUtil.createRule({
            ...req.body,
            circle_id: parseInt(circleId)
        });
        res.status(201).json({ code: 201, message: '自动化规则创建成功', data: newRule, error: null });
    } catch (error) {
        next(error);
    }
});


/**
 * @api {GET} /api/guardian/circle/:circleId/rules - 获取圈内所有规则
 * @permission 圈内成员
 */
router.get('/circle/:circleId/rules', authorize([1, 2]), async (req, res, next) => {
    // ... 同样需要校验是否为圈内成员，此处简化 ...
    try {
        const { circleId } = req.params;
        const rules = await actionRuleUtil.findRulesByCircleId(parseInt(circleId));
        res.json({ code: 200, message: '获取规则列表成功', data: rules, error: null });
    } catch (error) {
        next(error);
    }
});

// ... PUT 和 DELETE 路由与 POST 类似，都需要严格的圈主/管理员权限校验 ...

export default router;
