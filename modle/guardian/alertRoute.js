// ./modle/guardian/alertRoute.js
import express from 'express';
import alertUtil from './alertUtil.js';
import memberUtil from './memberUtil.js';
import authorize from '../auth/authUtils.js';

// 创建一个通用的token验证中间件
const verifyToken = authorize([]);

const router = express.Router();

/**
 * @description 获取告警记录（根据用户角色返回不同范围的数据）
 * @route GET /api/guardian/alert
 * @param {string} [status] - 告警状态筛选: 'pending'(待处理), 'acknowledged'(已处理), 'all'(全部)
 * @param {number} [page=1] - 页码
 * @param {number} [limit=20] - 每页数量
 * @param {number} [circleId] - 圈子ID筛选（可选）
 * @access 需要登录
 * @description 普通用户：返回其所属所有圈子的告警；管理员：返回系统所有告警
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 20, circleId } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role; // 假设token中包含用户角色信息

        let result;
        
        // 管理员（角色2）和超级管理员（角色3）可以查看所有告警
        if (userRole >= 2) {
            result = await alertUtil.findAllAlerts(
                status,
                parseInt(page),
                parseInt(limit),
                circleId ? parseInt(circleId) : null
            );
        } else {
            // 普通用户只能查看自己圈子的告警
            result = await alertUtil.findAlertsByUserId(
                userId,
                status,
                parseInt(page),
                parseInt(limit)
            );
        }

        res.json({
            success: true,
            data: result,
            userRole: userRole // 返回用户角色，便于前端判断
        });
    } catch (error) {
        console.error('获取告警记录失败:', error);
        res.status(500).json({
            success: false,
            message: '获取告警记录失败'
        });
    }
});

/**
 * @description 获取告警统计信息
 * @route GET /api/guardian/alert/stats
 * @access 需要登录
 * @description 普通用户：返回其所属圈子的统计；管理员：返回系统全局统计
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        // 管理员获取全局统计，普通用户获取个人相关统计
        const stats = await alertUtil.getAlertStats(
            userRole >= 2 ? null : userId
        );

        res.json({
            success: true,
            data: stats,
            userRole: userRole
        });
    } catch (error) {
        console.error('获取告警统计失败:', error);
        res.status(500).json({
            success: false,
            message: '获取告警统计失败'
        });
    }
});

/**
 * @description 获取守护圈告警记录（保留原有接口，向后兼容）
 * @route GET /api/guardian/alert/:circleId
 * @param {number} circleId - 守护圈ID
 * @param {string} [status] - 告警状态筛选: 'pending'(待处理), 'acknowledged'(已处理), 'all'(全部)
 * @param {number} [page=1] - 页码
 * @param {number} [limit=20] - 每页数量
 * @access 需要登录，且为圈内成员或管理员
 */
router.get('/:circleId([0-9]+)', verifyToken, async (req, res) => {
    try {
        const { circleId } = req.params;
        const { status = 'all', page = 1, limit = 20 } = req.query;
        const userId = req.user.id;
        const userRole = req.user.role;

        // 管理员可以查看任意圈子，普通用户需要验证权限
        if (userRole < 2) {
            const member = await memberUtil.findMemberByUserAndCircle(userId, circleId);
            if (!member) {
                return res.status(403).json({
                    success: false,
                    message: '无权限访问该守护圈的告警记录'
                });
            }
        }

        const result = await alertUtil.findAlertsByCircleId(
            parseInt(circleId),
            status,
            parseInt(page),
            parseInt(limit)
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('获取告警记录失败:', error);
        res.status(500).json({
            success: false,
            message: '获取告警记录失败'
        });
    }
});

/**
 * @description 更新告警状态
 * @route PUT /api/guardian/alert/:alertId
 * @param {number} alertId - 告警ID
 * @param {number} status - 新状态: 2(已确认), 3(已忽略)
 * @access 需要登录，且为圈内成员或管理员
 */
router.put('/:alertId', verifyToken, async (req, res) => {
    try {
        const { alertId } = req.params;
        const { status } = req.body;
        const userId = req.user.id;
        const userRole = req.user.role;

        // 验证状态值
        if (![2, 3].includes(parseInt(status))) {
            return res.status(400).json({
                success: false,
                message: '无效的状态值'
            });
        }

        // 获取告警信息
        const alert = await alertUtil.findAlertById(parseInt(alertId));
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: '告警记录不存在'
            });
        }

        // 管理员可以处理任意告警，普通用户需要验证权限
        if (userRole < 2) {
            const member = await memberUtil.findMemberByUserAndCircle(userId, alert.circle_id);
            if (!member) {
                return res.status(403).json({
                    success: false,
                    message: '无权限处理该告警'
                });
            }
        }

        const success = await alertUtil.updateAlertStatus(
            parseInt(alertId),
            parseInt(status),
            userId
        );

        if (success) {
            res.json({
                success: true,
                message: '告警状态更新成功'
            });
        } else {
            res.status(400).json({
                success: false,
                message: '告警状态更新失败，可能已被处理'
            });
        }
    } catch (error) {
        console.error('更新告警状态失败:', error);
        res.status(500).json({
            success: false,
            message: '更新告警状态失败'
        });
    }
});

/**
 * @description 删除告警记录
 * @route DELETE /api/guardian/alert/:alertId
 * @param {number} alertId - 告警ID
 * @access 需要登录，且为管理员或圈内成员（只能删除自己圈子的告警）
 */
router.delete('/:alertId', verifyToken, async (req, res) => {
    try {
        const { alertId } = req.params;
        const userId = req.user.id;
        const userRole = req.user.role;

        // 获取告警信息
        const alert = await alertUtil.findAlertById(parseInt(alertId));
        if (!alert) {
            return res.status(404).json({
                success: false,
                message: '告警记录不存在'
            });
        }

        // 管理员可以删除任意告警，普通用户需要验证权限
        if (userRole < 2) {
            const member = await memberUtil.findMemberByUserAndCircle(userId, alert.circle_id);
            if (!member) {
                return res.status(403).json({
                    success: false,
                    message: '权限不足，无法删除该告警记录'
                });
            }
        }

        const success = await alertUtil.deleteAlertById(parseInt(alertId));

        if (success) {
            res.json({
                success: true,
                message: '告警记录删除成功'
            });
        } else {
            res.status(404).json({
                success: false,
                message: '告警记录不存在或删除失败'
            });
        }
    } catch (error) {
        console.error('删除告警记录失败:', error);
        res.status(500).json({
            success: false,
            message: '删除告警记录失败'
        });
    }
});


export default router;
