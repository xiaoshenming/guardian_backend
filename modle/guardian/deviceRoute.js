import express from 'express';
import authorize from '../auth/authUtils.js';
import deviceUtil from './deviceUtil.js';
import memberUtil from './memberUtil.js'; // 引入成员工具以判断权限

const router = express.Router();

/**
 * @api {POST} /api/guardian/device/bind - 绑定新设备到守护圈
 * @description 用户将一个硬件设备绑定到指定的守护圈。
 * @permission 圈内成员
 * @body {string} device_sn - 设备的唯一序列号 (必填)
 * @body {number} circle_id - 要绑定的守护圈ID (必填)
 * @body {string} device_name - 设备自定义名称 (必填)
 * @body {string} [device_model] - 设备型号 (选填)
 * @body {object} [config] - 设备专属配置 (选填, JSON对象)
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
 * @api {GET} /api/guardian/device/provisioning-info - [供硬件设备调用] 获取预配信息
 * @description 此接口专为硬件设备（如Hi3516）设计。设备开机后，通过此接口查询自身是否已被用户绑定到某个守护圈，并获取关键的 `circle_id` 用于后续的 MQTT 通信。
 * @header {string} Authorization - 专为设备设计的认证头。格式必须为: "Device-SN <your_device_sn>"
 * @apiSuccess (200) {number} circle_id 设备所属的守护圈ID。
 * @apiSuccess (200) {boolean} is_bound 设备是否已绑定。
 * @apiError (404) {boolean} is_bound=false 设备未找到或未被任何用户绑定。
 */
router.get('/device/provisioning-info', async (req, res, next) => {
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
