import express from 'express';
import authorize from '../auth/authUtils.js';
import deviceUtil from './deviceUtil.js';
import memberUtil from './memberUtil.js'; // 引入成员工具以判断权限

const router = express.Router();

/**
 * @swagger
 * /api/guardian/device/bind:
 *   post:
 *     summary: 绑定新设备到守护圈
 *     description: 用户将一个硬件设备绑定到指定的守护圈，需要是圈内成员才能操作
 *     tags: [设备管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - device_sn
 *               - circle_id
 *               - device_name
 *             properties:
 *               device_sn:
 *                 type: string
 *                 description: 设备的唯一序列号
 *                 example: "GD001234567890"
 *               circle_id:
 *                 type: integer
 *                 description: 要绑定的守护圈ID
 *                 example: 1
 *               device_name:
 *                 type: string
 *                 description: 设备自定义名称
 *                 example: "客厅摄像头"
 *               device_model:
 *                 type: string
 *                 description: 设备型号（可选）
 *                 example: "Hi3516DV300"
 *               config:
 *                 type: object
 *                 description: 设备专属配置（可选）
 *                 example: {"resolution": "1080p", "fps": 30}
 *     responses:
 *       201:
 *         description: 设备绑定成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Device'
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，不是圈内成员
 *       500:
 *         description: 服务器内部错误
 */
router.post('/bind', authorize([1, 2]), async (req, res, next) => {
    try {
        const { device_sn, circle_id, device_name, device_model, config } = req.body;
        const { id: userId, role } = req.user;

        if (!device_sn || !circle_id || !device_name) {
            return res.status(400).json({ code: 400, message: '设备SN、守护圈ID和设备名称为必填项', data: null, error: null });
        }

        // 权限验证：必须是圈内成员才能绑定设备
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circle_id);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
            }
        }

        const newDevice = await deviceUtil.bindDeviceToCircle(
            { device_sn, device_name, device_model, config },
            circle_id,
            userId
        );

        res.status(201).json({ code: 201, message: '设备绑定成功', data: newDevice, error: null });

    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ code: error.statusCode, message: error.message, data: null, error: null });
        }
        next(error);
    }
});


/**
 * @api {PUT} /api/guardian/device/:deviceId - 更新设备信息
 * @description 更新一个已绑定设备的名称或配置。
 * @permission 圈主 / 最初绑定者 / 系统管理员
 * @body {string} [device_name] - 新的设备名称
 * @body {object} [config] - 新的设备配置 (JSON)
 */
router.put('/:deviceId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { id: userId, role } = req.user;
        const { device_name, config } = req.body;

        const device = await deviceUtil.findDeviceById(deviceId);
        if (!device || !device.circle_id) {
            return res.status(404).json({ code: 404, message: '设备不存在或未绑定到任何守护圈', data: null, error: null });
        }

        // 权限验证: 系统管理员、圈主、或绑定者本人
        const isOwner = device.creator_uid === userId;
        const isBinder = device.bound_by_uid === userId;
        if (role < 2 && !isOwner && !isBinder) {
            return res.status(403).json({ code: 403, message: '权限不足，只有圈主或设备绑定者可以修改', data: null, error: null });
        }

        await deviceUtil.updateDeviceInfo(deviceId, { device_name, config });
        res.json({ code: 200, message: '设备信息更新成功', data: null, error: null });

    } catch (error) {
        next(error);
    }
});


/**
 * @api {DELETE} /api/guardian/device/:deviceId - 解绑设备
 * @description 从守护圈解绑一个设备 (软删除)。
 * @permission 圈主 / 系统管理员
 */
router.delete('/:deviceId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { deviceId } = req.params;
        const { id: userId, role } = req.user;

        const device = await deviceUtil.findDeviceById(deviceId);
        if (!device || !device.circle_id) {
            return res.status(404).json({ code: 404, message: '设备不存在或未绑定', data: null, error: null });
        }

        // 权限验证：只有圈主或系统管理员可以解绑
        const isOwner = device.creator_uid === userId;
        if (role < 2 && !isOwner) {
            return res.status(403).json({ code: 403, message: '权限不足，只有圈主可以解绑设备', data: null, error: null });
        }

        await deviceUtil.unbindDeviceFromCircle(deviceId);
        res.json({ code: 200, message: '设备解绑成功', data: null, error: null });

    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/guardian/device/provisioning-info:
 *   get:
 *     summary: 获取设备预配信息
 *     description: 专为硬件设备设计的接口，设备开机后查询自身绑定状态和守护圈信息
 *     tags: [设备管理]
 *     security:
 *       - deviceAuth: []
 *     parameters:
 *       - name: Authorization
 *         in: header
 *         required: true
 *         description: 设备认证头，格式为 "Device-SN <设备序列号>"
 *         schema:
 *           type: string
 *           example: "Device-SN GD001234567890"
 *     responses:
 *       200:
 *         description: 设备已绑定，返回守护圈信息
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         circle_id:
 *                           type: integer
 *                           description: 设备所属的守护圈ID
 *                           example: 1
 *                         is_bound:
 *                           type: boolean
 *                           description: 设备绑定状态
 *                           example: true
 *       404:
 *         description: 设备未绑定或不存在
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         is_bound:
 *                           type: boolean
 *                           description: 设备绑定状态
 *                           example: false
 *       400:
 *         description: 请求头中未提供设备SN
 *       401:
 *         description: 认证头缺失或格式不正确
 */
router.get('/provisioning-info', async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // 1. 校验认证头格式
        if (!authHeader || !authHeader.startsWith('Device-SN ')) {
            return res.status(401).json({
                code: 401,
                message: '认证头缺失或格式不正确，期望格式: "Device-SN <SN>"',
                data: null,
                error: 'Unauthorized'
            });
        }

        // 2. 提取设备 SN
        const deviceSn = authHeader.split(' ')[1];
        if (!deviceSn) {
            return res.status(400).json({
                code: 400,
                message: '请求头中未提供设备SN',
                data: null,
                error: 'Bad Request'
            });
        }

        // 3. 查询设备信息
        const device = await deviceUtil.findDeviceBySn(deviceSn);

        // 4. 根据查询结果返回不同信息
        if (device && device.circle_id) {
            // --- 场景一: 设备已找到，且已成功绑定到一个守护圈 ---
            res.json({
                code: 200,
                message: '设备信息获取成功',
                data: {
                    circle_id: device.circle_id,
                    is_bound: true
                }
            });
        } else {
            // --- 场景二: 设备在数据库中不存在，或存在但未绑定 (circle_id is NULL) ---
            res.status(404).json({
                code: 404,
                message: '设备未绑定',
                data: {
                    is_bound: false
                }
            });
        }
    } catch (error) {
        next(error); // 交给全局错误处理器
    }
});
export default router;
