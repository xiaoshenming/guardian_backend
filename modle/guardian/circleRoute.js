// circleRoute.js
import express from 'express';
import authorize from '../auth/authUtils.js'; // 引入鉴权中间件
import circleUtil from './circleUtil.js';
import deviceUtil from './deviceUtil.js';
import memberUtil from './memberUtil.js';

const router = express.Router();

/**
 * @api {POST} /api/guardian/circle - 创建守护圈
 * @description 用户创建一个新的守护圈，创建后自动成为该圈的圈主。
 * @permission 普通用户(1), 管理员(2)
 * @body {string} circle_name - 守护圈名称 (必填)
 * @body {string} [description] - 守护圈描述 (选填)
 */
router.post('/', authorize([1, 2]), async (req, res, next) => {
  try {
    const { circle_name, description } = req.body;
    // 1. 输入验证
    if (!circle_name) {
      return res.status(400).json({ code: 400, message: '守护圈名称不能为空', data: null, error: null });
    }

    // 2. 从 req.user 获取创建者ID (来自JWT)
    const creatorUid = req.user.id;

    // 3. 调用工具函数创建圈子
    const newCircle = await circleUtil.createCircle({ circle_name, description }, creatorUid);

    // 4. 返回成功响应
    res.status(201).json({
      code: 201,
      message: '守护圈创建成功',
      data: newCircle,
      error: null
    });

  } catch (error) {
    next(error); // 将错误传递给全局错误处理器
  }
});


/**
 * @api {GET} /api/guardian/circle - 获取守护圈列表
 * @description 根据用户角色获取守护圈列表。
 * - 普通用户(1): 只能看到自己创建的圈子。
 * - 管理员(2): 可以看到所有用户创建的圈子。
 * @permission 普通用户(1), 管理员(2)
 */
router.get('/', authorize([1, 2]), async (req, res, next) => {
  try {
    const { id: userId, role } = req.user;
    let circles;

    if (role === 1) { // 普通用户
      circles = await circleUtil.findCirclesByCreatorId(userId);
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
 * @api {GET} /api/guardian/circle/:id - 获取指定守护圈详情
 * @description 获取单个守护圈的详细信息。
 * @permission 普通用户(1) 只能看自己的圈子, 管理员(2) 可以看任意圈子
 */
router.get('/:id', authorize([1, 2]), async (req, res, next) => {
  try {
    const { id: circleId } = req.params;
    const { id: userId, role } = req.user;

    const circle = await circleUtil.findCircleById(circleId);

    if (!circle) {
      return res.status(404).json({ code: 404, message: '守护圈不存在', data: null, error: null });
    }

    // 权限检查：普通用户只能查看自己创建的圈子
    if (role === 1 && circle.creator_uid !== userId) {
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
 * @api {PUT} /api/guardian/circle/:id - 更新守护圈信息
 * @description 更新守护圈的名称和描述。
 * @permission 普通用户(1) 只能更新自己的圈子, 管理员(2) 可以更新任意圈子
 * @body {string} circle_name - 新的守护圈名称 (必填)
 * @body {string} [description] - 新的守护圈描述 (选填)
 */
router.put('/:id', authorize([1, 2]), async (req, res, next) => {
  try {
    const { id: circleId } = req.params;
    const { id: userId, role } = req.user;
    const { circle_name, description } = req.body;

    if (!circle_name) {
      return res.status(400).json({ code: 400, message: '守护圈名称不能为空', data: null, error: null });
    }

    // 1. 检查圈子是否存在
    const circle = await circleUtil.findCircleById(circleId);
    if (!circle) {
      return res.status(404).json({ code: 404, message: '要更新的守护圈不存在', data: null, error: null });
    }

    // 2. 权限检查
    if (role === 1 && circle.creator_uid !== userId) {
      return res.status(403).json({ code: 403, message: '权限不足，无法修改此守护圈', data: null, error: null });
    }

    // 3. 执行更新
    await circleUtil.updateCircle(circleId, { circle_name, description });

    res.json({
      code: 200,
      message: '守护圈信息更新成功',
      data: null,
      error: null
    });

  } catch (error) {
    next(error);
  }
});


/**
 * @api {DELETE} /api/guardian/circle/:id - 删除守护圈
 * @description 删除一个守护圈及其所有关联数据。
 * @permission 普通用户(1) 只能删除自己的圈子, 管理员(2) 可以删除任意圈子
 */
router.delete('/:id', authorize([1, 2]), async (req, res, next) => {
  try {
    const { id: circleId } = req.params;
    const { id: userId, role } = req.user;

    // 1. 检查圈子是否存在
    const circle = await circleUtil.findCircleById(circleId);
    if (!circle) {
      return res.status(404).json({ code: 404, message: '要删除的守护圈不存在', data: null, error: null });
    }

    // 2. 权限检查
    if (role === 1 && circle.creator_uid !== userId) {
      return res.status(403).json({ code: 403, message: '权限不足，无法删除此守护圈', data: null, error: null });
    }

    // 3. 执行删除（事务已在Util层处理）
    await circleUtil.deleteCircle(circleId);

    res.json({
      code: 200,
      message: '守护圈已成功删除',
      data: null,
      error: null
    });

  } catch (error) {
    next(error);
  }
});


/**
 * @api {GET} /api/guardian/circle/:circleId/devices - 获取圈内所有设备
 * @description 获取指定守护圈下绑定的所有设备列表。
 * @permission 圈内成员
 */
router.get('/:circleId/devices', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: userId, role } = req.user;

        // 权限验证：必须是圈内成员或管理员
        if (role < 2) {
            const membership = await memberUtil.getMembership(userId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
            }
        }

        const devices = await deviceUtil.findDevicesByCircleId(circleId);
        res.json({ code: 200, message: '获取设备列表成功', data: devices, error: null });

    } catch (error) {
        next(error);
    }
});


/**
 * @api {GET} /api/guardian/circle/dashboard/stats - 获取仪表盘统计数据
 * @description 获取仪表盘的各项统计数据，包括圈子数量、成员数量、设备数量、告警数量等。
 * - 普通用户(1): 只能看到自己参与的圈子相关统计。
 * - 管理员(2): 可以看到全局统计数据。
 * @permission 普通用户(1), 管理员(2)
 * @returns {object} 统计数据对象
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
 * @api {GET} /api/guardian/circle/dashboard/charts - 获取仪表盘图表数据
 * @description 获取仪表盘的各种图表数据，用于ECharts等图表组件展示。
 * 包括告警趋势、设备状态分布、圈子活跃度、告警类型分布、成员增长趋势等。
 * - 普通用户(1): 只能看到自己参与的圈子相关图表数据。
 * - 管理员(2): 可以看到全局图表数据。
 * @permission 普通用户(1), 管理员(2)
 * @returns {object} 图表数据对象
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
