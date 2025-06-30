// ./modle/guardian/alertRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import alertUtil from './alertUtil.js';
import memberUtil from './memberUtil.js';

const router = express.Router();

/**
 * @api {GET} /api/guardian/alerts/circle/:circleId - 获取守护圈的告警记录
 * @permission 圈内成员 或 管理员
 * @query {string} [status=pending] - 'pending', 'acknowledged', 'all'
 * @query {number} [page=1]
 * @query {number} [limit=20]
 */
router.get('/circle/:circleId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;
        const { status = 'pending', page = 1, limit = 20 } = req.query;

        // 权限验证
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足', data: null });
            }
        }

        const data = await alertUtil.findAlertsByCircleId(parseInt(circleId), status, parseInt(page), parseInt(limit));
        res.json({ code: 200, message: '获取告警记录成功', data, error: null });
    } catch (error) {
        next(error);
    }
});

/**
 * @api {PUT} /api/guardian/alerts/:alertId/status - 处理告警
 * @permission 圈内成员 或 管理员
 * @body {number} status - 新状态 (2: 已确认, 3: 已忽略)
 */
router.put('/:alertId/status', authorize([1, 2]), async (req, res, next) => {
    try {
        const { alertId } = req.params;
        const { id: userId, role } = req.user;
        const { status } = req.body;

        if (![2, 3].includes(status)) {
            return res.status(400).json({ code: 400, message: '无效的状态值', data: null });
        }

        const alert = await alertUtil.findAlertById(parseInt(alertId));
        if (!alert) {
            return res.status(404).json({ code: 404, message: '告警不存在', data: null });
        }

        // 权限验证
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, alert.circle_id);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不属于该告警所在的守护圈', data: null });
            }
        }

        const success = await alertUtil.updateAlertStatus(parseInt(alertId), userId, status);
        if (success) {
            res.json({ code: 200, message: '告警状态更新成功', data: null });
        } else {
            res.status(409).json({ code: 409, message: '告警已被处理，请勿重复操作', data: null });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * @api {DELETE} /api/guardian/alerts/:alertId - 删除告警记录
 * @permission 仅限管理员
 */
router.delete('/:alertId', authorize([2]), async (req, res, next) => {
    try {
        const { alertId } = req.params;

        const success = await alertUtil.deleteAlertById(parseInt(alertId));
        if (success) {
            res.json({ code: 200, message: '告警记录删除成功', data: null });
        } else {
            res.status(404).json({ code: 404, message: '告警记录不存在', data: null });
        }
    } catch (error) {
        next(error);
    }
});


export default router;
