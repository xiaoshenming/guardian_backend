// ./modle/guardian/eventRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import eventUtil from './eventUtil.js';
import memberUtil from './memberUtil.js';

const router = express.Router();

/**
 * @api {GET} /api/guardian/events/circle/:circleId - 获取守护圈的事件日志
 * @permission 圈内成员 或 管理员
 */
router.get('/circle/:circleId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;
        const { page = 1, limit = 20 } = req.query;

        // 权限验证：管理员直接通过，普通用户必须是圈内成员
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null });
            }
        }

        const data = await eventUtil.findEventsByCircleId(parseInt(circleId), parseInt(page), parseInt(limit));
        res.json({ code: 200, message: '获取事件日志成功', data, error: null });

    } catch (error) {
        next(error);
    }
});

/**
 * @api {DELETE} /api/guardian/events/:eventId - 删除事件日志
 * @permission 仅限管理员
 */
router.delete('/:eventId', authorize([2]), async (req, res, next) => {
    try {
        const { eventId } = req.params;

        const event = await eventUtil.findEventById(parseInt(eventId));
        if (!event) {
            return res.status(404).json({ code: 404, message: '事件日志不存在', data: null });
        }

        const success = await eventUtil.deleteEventById(parseInt(eventId));
        if (success) {
            res.json({ code: 200, message: '事件日志删除成功', data: null, error: null });
        } else {
            // 理论上如果能找到，就一定能删掉，但以防万一
            throw new Error('删除事件日志失败');
        }
    } catch (error) {
        next(error);
    }
});


export default router;
