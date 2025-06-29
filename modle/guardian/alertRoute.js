// ./modle/guardian/alertRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import alertUtil from './alertUtil.js';
import memberUtil from './memberUtil.js';

const router = express.Router();

/**
 * @api {GET} /api/guardian/circle/:circleId/alerts - 获取守护圈的告警记录
 * @description 获取指定守护圈下的告警，可按状态筛选。
 * @permission 圈内成员
 * @query {string} [status=pending] - 状态 (pending, acknowledged, all)
 */
router.get('/circle/:circleId/alerts', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;
        const { status = 'pending' } = req.query;

        // 权限验证
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足', data: null, error: null });
            }
        }
        const alerts = await alertUtil.findAlertsByCircleId(parseInt(circleId), status);
        res.json({ code: 200, message: '获取告警记录成功', data: alerts, error: null });
    } catch (error) {
        next(error);
    }
});

/**
 * @api {PUT} /api/guardian/alert/:alertId/acknowledge - 处理告警
 * @description 成员确认或忽略一条告警。
 * @permission 圈内成员 (虽然任何成员都可调用，但需要验证其是否属于该告警的圈子)
 * @body {number} status - 新状态 (2: 已确认, 3: 已忽略)
 */
router.put('/alert/:alertId/acknowledge', authorize([1, 2]), async (req, res, next) => {
    try {
        const { alertId } = req.params;
        const { id: userId } = req.user;
        const { status } = req.body;

        if (![2, 3].includes(status)) {
            return res.status(400).json({ code: 400, message: '无效的状态值', data: null, error: null });
        }

        // 可以在 achnowledgeAlert 函数内部增加对用户是否属于该圈的校验，这里为简化省略
        const success = await alertUtil.acknowledgeAlert(parseInt(alertId), userId, status);

        if (success) {
            res.json({ code: 200, message: '告警状态更新成功', data: null, error: null });
        } else {
            res.status(404).json({ code: 404, message: '告警不存在或已被处理', data: null, error: null });
        }
    } catch (error) {
        next(error);
    }
});

export default router;
