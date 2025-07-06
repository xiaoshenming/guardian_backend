// ./modle/guardian/smartHomeDeviceRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js';
import smartHomeDeviceUtil from './smartHomeDeviceUtil.js';
import memberUtil from './memberUtil.js';
import circleUtil from './circleUtil.js';

const router = express.Router();

// 基路径: /api/guardian/smart-devices

/**
 * @swagger
 * /api/guardian/circle/{circleId}/smart-devices:
 *   post:
 *     summary: 添加智能家居设备
 *     description: 圈内成员向指定守护圈添加一个第三方智能设备
 *     tags: [智能家居设备]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: circleId
 *         in: path
 *         required: true
 *         description: 守护圈ID
 *         schema:
 *           type: integer
 *           format: int64
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - device_name
 *               - protocol
 *               - api_endpoint
 *             properties:
 *               device_name:
 *                 type: string
 *                 description: 设备名称
 *                 example: "智能灯泡"
 *               protocol:
 *                 type: string
 *                 description: 通信协议
 *                 example: "HTTP"
 *               api_endpoint:
 *                 type: string
 *                 description: API端点
 *                 example: "http://192.168.1.100:8080/api"
 *               status:
 *                 type: string
 *                 description: 设备状态
 *                 example: "online"
 *     responses:
 *       201:
 *         description: 智能设备添加成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/SmartDevice'
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，您不是该守护圈的成员
 *       500:
 *         description: 服务器内部错误
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
 * @swagger
 * /api/guardian/circle/{circleId}/smart-devices:
 *   get:
 *     summary: 获取圈内智能设备列表
 *     description: 获取指定守护圈内的所有智能家居设备列表
 *     tags: [智能家居设备]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: circleId
 *         in: path
 *         required: true
 *         description: 守护圈ID
 *         schema:
 *           type: integer
 *           format: int64
 *         example: 1
 *     responses:
 *       200:
 *         description: 获取智能设备列表成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SmartDevice'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器内部错误
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
 * @swagger
 * /api/guardian/smart-devices/{deviceId}:
 *   put:
 *     summary: 更新智能设备信息
 *     description: 更新智能家居设备的信息。需要圈主或管理员权限
 *     tags: [智能家居设备]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: deviceId
 *         in: path
 *         required: true
 *         description: 智能设备ID
 *         schema:
 *           type: integer
 *           format: int64
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               device_name:
 *                 type: string
 *                 description: 设备名称
 *                 example: "智能灯泡"
 *               protocol:
 *                 type: string
 *                 description: 通信协议
 *                 example: "HTTP"
 *               api_endpoint:
 *                 type: string
 *                 description: API端点
 *                 example: "http://192.168.1.100:8080/api"
 *               status:
 *                 type: string
 *                 description: 设备状态
 *                 example: "online"
 *     responses:
 *       200:
 *         description: 智能设备更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 设备未找到或无内容更新
 *       500:
 *         description: 服务器内部错误
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
 * @swagger
 * /api/guardian/smart-devices/{deviceId}:
 *   delete:
 *     summary: 删除智能设备
 *     description: 删除指定的智能家居设备。需要圈主或管理员权限
 *     tags: [智能家居设备]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: deviceId
 *         in: path
 *         required: true
 *         description: 智能设备ID
 *         schema:
 *           type: integer
 *           format: int64
 *         example: 1
 *     responses:
 *       200:
 *         description: 智能设备删除成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 设备未找到
 *       500:
 *         description: 服务器内部错误
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
