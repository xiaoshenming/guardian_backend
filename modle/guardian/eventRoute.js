// ./modle/guardian/eventRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import eventUtil from './eventUtil.js';
import memberUtil from './memberUtil.js';

const router = express.Router();

/**
 * @api {GET} /api/guardian/circle/:circleId/events - 获取守护圈的事件日志
 * @description 分页获取指定守护圈下的所有事件日志。
 * @permission 圈内成员
 */
router.get('/circle/:circleId/events', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;
        const { page = 1, limit = 20 } = req.query;

        // 权限验证：必须是圈内成员或管理员
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
            }
        }

        const events = await eventUtil.findEventsByCircleId(parseInt(circleId), parseInt(page), parseInt(limit));
        res.json({ code: 200, message: '获取事件日志成功', data: events, error: null });

    } catch (error) {
        next(error);
    }
});

export default router;
