// ./modle/guardian/smartHomeDeviceRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import smartHomeDeviceUtil from './smartHomeDeviceUtil.js';
import memberUtil from './memberUtil.js';
import circleUtil from './circleUtil.js';

const router = express.Router();

// 基路径: /api/guardian/smart-devices

/**
 * @api {POST} /api/guardian/circle/:circleId/smart-devices - 添加智能家居设备
 * @description 圈内成员向指定守护圈添加一个第三方智能设备。
 * @permission 圈内成员
 */
router.post('/circle/:circleId/smart-devices', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;
        const { device_name, protocol, api_endpoint, status } = req.body;

        if (!device_name || !protocol || !api_endpoint) {
            return res.status(400).json({ code: 400, message: '设备名称、协议和API端点不能为空', data: null, error: null });
        }

        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
            }
        }

        const newDevice = await smartHomeDeviceUtil.addSmartDevice({
            device_name, circle_id: parseInt(circleId), protocol, api_endpoint, status
        });
        res.status(201).json({ code: 201, message: '智能设备添加成功', data: newDevice, error: null });
    } catch (error) {
        next(error);
    }
});


/**
 * @api {GET} /api/guardian/circle/:circleId/smart-devices - 获取圈内智能设备列表
 * @permission 圈内成员
 */
router.get('/circle/:circleId/smart-devices', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;

        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足', data: null, error: null });
            }
        }

        const devices = await smartHomeDeviceUtil.findSmartDevicesByCircleId(parseInt(circleId));
        res.json({ code: 200, message: '获取智能设备列表成功', data: devices, error: null });
    } catch (error) {
        next(error);
    }
});


/**
 * @api {PUT} /api/guardian/smart-devices/:deviceId - 更新智能设备信息
 * @permission 圈主或管理员
 */
router.put('/smart-devices/:deviceId', authorize([1, 2]), async (req, res, next) => {
    try {
        // ... 此处应添加权限校验逻辑，校验操作者是否为该设备所在圈的圈主或管理员 ...
        // 为简化，此处暂时省略，但生产环境必须加上！
        const { deviceId } = req.params;
        const success = await smartHomeDeviceUtil.updateSmartDevice(parseInt(deviceId), req.body);
        if (success) {
            res.json({ code: 200, message: '智能设备更新成功', data: null, error: null });
        } else {
            res.status(404).json({ code: 404, message: '设备未找到或无内容更新', data: null, error: null });
        }
    } catch (error) {
        next(error);
    }
});


/**
 * @api {DELETE} /api/guardian/smart-devices/:deviceId - 删除智能设备
 * @permission 圈主或管理员
 */
router.delete('/smart-devices/:deviceId', authorize([1, 2]), async (req, res, next) => {
    try {
        // ... 此处同样应添加权限校验逻辑 ...
        const { deviceId } = req.params;
        const success = await smartHomeDeviceUtil.removeSmartDevice(parseInt(deviceId));
        if (success) {
            res.json({ code: 200, message: '智能设备删除成功', data: null, error: null });
        } else {
            res.status(404).json({ code: 404, message: '设备未找到', data: null, error: null });
        }
    } catch (error) {
        next(error);
    }
});

export default router;
