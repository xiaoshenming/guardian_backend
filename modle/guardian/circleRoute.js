// circleRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js'; // 引入鉴权中间件
import circleUtil from './circleUtil.js';
import deviceUtil from './deviceUtil.js';
import memberUtil from './memberUtil.js';

const router = express.Router();

/**
 * @swagger
 * /api/guardian/circle:
 *   post:
 *     summary: 创建守护圈
 *     description: 用户创建一个新的守护圈，创建后自动成为该圈的圈主
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - circle_name
 *             properties:
 *               circle_name:
 *                 type: string
 *                 description: 守护圈名称
 *                 example: "我的家庭守护圈"
 *               description:
 *                 type: string
 *                 description: 守护圈描述（可选）
 *                 example: "保护家人安全的智能守护系统"
 *     responses:
 *       201:
 *         description: 守护圈创建成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Circle'
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post('/', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circle_name, description } = req.body;
        if (!circle_name) {
            return res.status(400).json({ code: 400, message: '守护圈名称不能为空', data: null, error: null });
        }

        // 修正：从 req.user 获取创建者的业务ID (uid)，而不是认证ID (id)
        const creatorUid = req.user.uid;

        // 检查 creatorUid 是否存在
        if (!creatorUid) {
            return res.status(400).json({ code: 400, message: '无效的用户凭证，缺少用户标识', data: null, error: null });
        }

        const newCircle = await circleUtil.createCircle({ circle_name, description }, creatorUid);

        res.status(201).json({
            code: 201,
            message: '守护圈创建成功',
            data: newCircle,
            error: null
        });

    } catch (error) {
        next(error);
    }
});

/**
 * @swagger
 * /api/guardian/circle:
 *   get:
 *     summary: 获取守护圈列表
 *     description: 根据用户角色获取守护圈列表。普通用户只能看到自己创建的圈子，管理员可以看到所有圈子
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - $ref: '#/components/parameters/page'
 *       - $ref: '#/components/parameters/limit'
 *     responses:
 *       200:
 *         description: 获取守护圈列表成功
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
 *                         $ref: '#/components/schemas/Circle'
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get('/', authorize([1, 2]), async (req, res, next) => {
    try {
        const { uid: userUid, role } = req.user; // 使用 uid
        let circles;

        if (role === 1) { // 普通用户
            // 修正：调用新的、正确的函数
            circles = await circleUtil.findCirclesByUserId(userUid);
        } else { // 管理员或更高权限
            circles = await circleUtil.findAllCircles();
        }

        res.json({
            code: 200,
            message: '获取守护圈列表成功',
            data: circles,
            error: null
        });

    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/circle/{id}:
 *   get:
 *     summary: 获取指定守护圈详情
 *     description: 获取单个守护圈的详细信息，普通用户只能看自己的圈子，管理员可以看任意圈子
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: id
 *         in: path
 *         required: true
 *         description: 守护圈ID
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: 获取守护圈详情成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Circle'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，无法查看此守护圈
 *       404:
 *         description: 守护圈不存在
 *       500:
 *         description: 服务器内部错误
 */
router.get('/:id', authorize([1, 2]), async (req, res, next) => {
    try {
        const { id: circleId } = req.params;
        const { uid: userUid, role } = req.user; // 修正：使用 uid 进行业务逻辑判断

        const circle = await circleUtil.findCircleById(circleId);

        if (!circle) {
            return res.status(404).json({ code: 404, message: '守护圈不存在', data: null, error: null });
        }

        // 权限检查：普通用户只能查看自己创建的圈子
        // 修正：使用 circle.creator_uid 和 userUid (都来自 user_profile.id) 进行比较
        if (role === 1 && circle.creator_uid !== userUid) {
            return res.status(403).json({ code: 403, message: '权限不足，无法查看此守护圈', data: null, error: null });
        }

        res.json({
            code: 200,
            message: '获取守护圈详情成功',
            data: circle,
            error: null
        });

    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/circle/{id}:
 *   put:
 *     summary: 更新守护圈信息
 *     description: 更新守护圈的名称和描述，普通用户只能更新自己的圈子，管理员可以更新任意圈子
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: id
 *         in: path
 *         required: true
 *         description: 守护圈ID
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - circle_name
 *             properties:
 *               circle_name:
 *                 type: string
 *                 description: 新的守护圈名称
 *                 example: "更新后的家庭守护圈"
 *               description:
 *                 type: string
 *                 description: 新的守护圈描述
 *                 example: "更新后的守护圈描述"
 *     responses:
 *       200:
 *         description: 守护圈信息更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，无法修改此守护圈
 *       404:
 *         description: 要更新的守护圈不存在
 *       500:
 *         description: 服务器内部错误
 */
router.put('/:id', authorize([1, 2]), async (req, res, next) => {
    try {
        const { id: circleId } = req.params;
        const { uid: userUid, role } = req.user; // 修正：使用 uid
        const { circle_name, description } = req.body;

        // ... (输入验证)

        const circle = await circleUtil.findCircleById(circleId);
        if (!circle) {
            return res.status(404).json({ code: 404, message: '要更新的守护圈不存在', data: null, error: null });
        }

        // 修正：权限检查
        if (role === 1 && circle.creator_uid !== userUid) {
            return res.status(403).json({ code: 403, message: '权限不足，无法修改此守护圈', data: null, error: null });
        }

        await circleUtil.updateCircle(circleId, { circle_name, description });
        res.json({ code: 200, message: '守护圈信息更新成功', data: null, error: null });
    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/circle/{id}:
 *   delete:
 *     summary: 删除守护圈
 *     description: 删除一个守护圈及其所有关联数据，普通用户只能删除自己的圈子，管理员可以删除任意圈子
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *       - name: id
 *         in: path
 *         required: true
 *         description: 守护圈ID
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: 守护圈已成功删除
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，无法删除此守护圈
 *       404:
 *         description: 要删除的守护圈不存在
 *       500:
 *         description: 服务器内部错误
 */
router.delete('/:id', authorize([1, 2]), async (req, res, next) => {
    try {
        const { id: circleId } = req.params;
        const { uid: userUid, role } = req.user; // 修正：使用 uid

        const circle = await circleUtil.findCircleById(circleId);
        if (!circle) {
            return res.status(404).json({ code: 404, message: '要删除的守护圈不存在', data: null, error: null });
        }

        // 修正：权限检查
        if (role === 1 && circle.creator_uid !== userUid) {
            return res.status(403).json({ code: 403, message: '权限不足，无法删除此守护圈', data: null, error: null });
        }

        await circleUtil.deleteCircle(circleId);
        res.json({ code: 200, message: '守护圈已成功删除', data: null, error: null });
    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/circle/{circleId}/devices:
 *   get:
 *     summary: 获取圈内所有设备
 *     description: 获取指定守护圈下绑定的所有设备列表，需要是圈内成员
 *     tags: [守护圈管理]
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
 *           example: 1
 *     responses:
 *       200:
 *         description: 获取设备列表成功
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
 *                         $ref: '#/components/schemas/Device'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，您不是该守护圈的成员
 *       500:
 *         description: 服务器内部错误
 */
router.get('/:circleId/devices', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { uid: userId, role } = req.user;

        // 权限验证：必须是圈内成员、圈子创建者或管理员
        if (role < 2) {
            // 首先检查是否是圈子创建者
            const circle = await circleUtil.findCircleById(circleId);
            if (!circle) {
                return res.status(404).json({ code: 404, message: '守护圈不存在', data: null, error: null });
            }
            
            const isCreator = circle.creator_uid === userId;
            
            // 如果不是创建者，再检查是否是圈内成员
            if (!isCreator) {
                const membership = await memberUtil.getMembership(userId, circleId);
                if (!membership) {
                    return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
                }
            }
        }

        const devices = await deviceUtil.findDevicesByCircleId(circleId);
        res.json({ code: 200, message: '获取设备列表成功', data: devices, error: null });

    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/circle/dashboard/stats:
 *   get:
 *     summary: 获取仪表盘统计数据
 *     description: 获取仪表盘的各项统计数据，包括圈子数量、成员数量、设备数量、告警数量等。普通用户只能看到自己参与的圈子相关统计，管理员可以看到全局统计数据
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 获取仪表盘统计数据成功
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
 *                         stats:
 *                           type: object
 *                           description: 统计数据
 *                         userRole:
 *                           type: integer
 *                           description: 用户角色
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *                           description: 数据时间戳
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get('/dashboard/stats', authorize([1, 2]), async (req, res, next) => {
    try {
        const { id: userId, role } = req.user;

        const stats = await circleUtil.getDashboardStats(userId, role);

        res.json({
            code: 200,
            message: '获取仪表盘统计数据成功',
            data: {
                stats,
                userRole: role,
                timestamp: new Date().toISOString()
            },
            error: null
        });

    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/circle/dashboard/charts:
 *   get:
 *     summary: 获取仪表盘图表数据
 *     description: 获取仪表盘的各种图表数据，用于ECharts等图表组件展示。包括告警趋势、设备状态分布、圈子活跃度、告警类型分布、成员增长趋势等。普通用户只能看到自己参与的圈子相关图表数据，管理员可以看到全局图表数据
 *     tags: [守护圈管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/deviceType'
 *     responses:
 *       200:
 *         description: 获取仪表盘图表数据成功
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
 *                         charts:
 *                           type: object
 *                           description: 图表数据
 *                         userRole:
 *                           type: integer
 *                           description: 用户角色
 *                         timestamp:
 *                           type: string
 *                           format: date-time
 *                           description: 数据时间戳
 *                         description:
 *                           type: object
 *                           description: 图表说明
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.get('/dashboard/charts', authorize([1, 2]), async (req, res, next) => {
    try {
        const { id: userId, role } = req.user;

        const chartData = await circleUtil.getDashboardCharts(userId, role);

        res.json({
            code: 200,
            message: '获取仪表盘图表数据成功',
            data: {
                charts: chartData,
                userRole: role,
                timestamp: new Date().toISOString(),
                description: {
                    alertTrend: '最近7天告警趋势',
                    deviceStatus: '设备状态分布',
                    circleActivity: '圈子活跃度排行（基于最近7天事件数量）',
                    alertTypes: '告警类型分布（最近30天）',
                    memberGrowth: '成员增长趋势（最近30天）'
                }
            },
            error: null
        });

    } catch (error) {
        next(error);
    }
});


export default router;
