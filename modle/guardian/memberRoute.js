import express from 'express';
import authorize from '../auth/authUtils.js';
import memberUtil from './memberUtil.js';
import circleUtil from './circleUtil.js';

const router = express.Router();

/**
 * @swagger
 * /api/guardian/member/join:
 *   post:
 *     summary: 通过邀请码加入守护圈
 *     description: 用户输入6位邀请码加入一个守护圈
 *     tags: [成员管理]
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
 *               - circle_code
 *             properties:
 *               circle_code:
 *                 type: string
 *                 description: 守护圈的6位邀请码
 *                 minLength: 6
 *                 maxLength: 6
 *                 example: "ABC123"
 *               member_alias:
 *                 type: string
 *                 description: 在圈内的昵称（选填，默认为用户自己的昵称）
 *                 example: "小明"
 *     responses:
 *       201:
 *         description: 成功加入守护圈
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Member'
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 未授权访问
 *       500:
 *         description: 服务器内部错误
 */
router.post('/join', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circle_code, member_alias } = req.body;
        const { id: userId } = req.user;

        if (!circle_code || circle_code.length !== 6) {
            return res.status(400).json({ code: 400, message: '请输入有效的6位邀请码', data: null, error: null });
        }

        const newMember = await memberUtil.joinCircleByCode(circle_code, userId, member_alias);

        res.status(201).json({
            code: 201,
            message: '成功加入守护圈',
            data: newMember,
            error: null
        });
    } catch (error) {
        // 自定义错误状态码处理
        if (error.statusCode) {
            return res.status(error.statusCode).json({ code: error.statusCode, message: error.message, data: null, error: null });
        }
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/member/{circleId}:
 *   get:
 *     summary: 获取守护圈成员列表
 *     description: 获取指定守护圈的所有成员信息。需要是圈内成员或系统管理员
 *     tags: [成员管理]
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
 *         description: 获取成员列表成功
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
 *                         $ref: '#/components/schemas/Member'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，您不是该守护圈的成员
 *       500:
 *         description: 服务器内部错误
 */
router.get('/:circleId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: requestingUserId, role: requestingUserRole } = req.user;

        // 权限检查：必须是圈内成员、圈子创建者或系统管理员
        if (requestingUserRole < 2) {
            // 首先检查是否是圈子创建者
            const circle = await circleUtil.findCircleById(circleId);
            if (!circle) {
                return res.status(404).json({ code: 404, message: '守护圈不存在', data: null, error: null });
            }
            
            const isCreator = circle.creator_uid === req.user.uid;
            
            // 如果不是创建者，再检查是否是圈内成员
            if (!isCreator) {
                const membership = await memberUtil.getMembership(requestingUserId, circleId);
                if (!membership) {
                    return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
                }
            }
        }

        const members = await memberUtil.findMembersByCircleId(circleId);
        res.json({
            code: 200,
            message: '获取成员列表成功',
            data: members,
            error: null
        });

    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/member/{circleId}/{memberMapId}:
 *   put:
 *     summary: 更新成员信息
 *     description: 更新成员的昵称或角色。系统管理员、圈主可以修改任何人，成员只能修改自己的昵称
 *     tags: [成员管理]
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
 *       - name: memberMapId
 *         in: path
 *         required: true
 *         description: 成员映射ID
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
 *               member_alias:
 *                 type: string
 *                 description: 在圈内的昵称
 *                 example: "小明"
 *               member_role:
 *                 type: integer
 *                 description: 成员角色（0=圈主，1=普通成员）
 *                 enum: [0, 1]
 *                 example: 1
 *               alert_level:
 *                 type: integer
 *                 description: 告警级别
 *                 example: 1
 *     responses:
 *       200:
 *         description: 成员信息更新成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，无法修改该成员信息
 *       404:
 *         description: 在当前守护圈中未找到该成员
 *       500:
 *         description: 服务器内部错误
 */
router.put('/:circleId/:memberMapId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId, memberMapId } = req.params;
        const { id: requestingUserId, role: requestingUserRole } = req.user;
        const { member_alias, member_role, alert_level } = req.body;

        // 1. 获取要更新的目标成员信息
        const targetMember = await memberUtil.findMemberByMapId(memberMapId);
        if (!targetMember || targetMember.circle_id != circleId) {
            return res.status(404).json({ code: 404, message: '在当前守护圈中未找到该成员', data: null, error: null });
        }

        // 2. 权限判断
        let canUpdate = false;
        if (requestingUserRole >= 2) { // 系统管理员有权操作
            canUpdate = true;
        } else {
            // 首先检查是否是圈子创建者
            const circle = await circleUtil.findCircleById(circleId);
            if (circle && circle.creator_uid === req.user.uid) {
                canUpdate = true;
            } else {
                const requestingUserMembership = await memberUtil.getMembership(requestingUserId, circleId);
                if (requestingUserMembership) {
                    // a. 圈主(member_role=0)可以修改任何人
                    if (requestingUserMembership.member_role === 0) {
                        canUpdate = true;
                    }
                    // b. 用户只能修改自己的昵称和告警级别，不能修改自己的角色
                    if (targetMember.uid === requestingUserId) {
                        if(member_role !== undefined && member_role !== targetMember.member_role) {
                            return res.status(403).json({ code: 403, message: '不能修改自己的角色', data: null, error: null });
                        }
                        canUpdate = true;
                    }
                }
            }
        }

        if (!canUpdate) {
            return res.status(403).json({ code: 403, message: '权限不足，无法修改该成员信息', data: null, error: null });
        }

        // 3. 执行更新
        await memberUtil.updateMember(memberMapId, { member_alias, member_role, alert_level });
        res.json({ code: 200, message: '成员信息更新成功', data: null, error: null });

    } catch (error) {
        next(error);
    }
});


/**
 * @swagger
 * /api/guardian/member/{circleId}/{memberMapId}:
 *   delete:
 *     summary: 移出或离开守护圈
 *     description: 圈主移除成员，或成员自己离开圈子。圈子的创建者不能被移除或离开，必须通过删除守护圈接口
 *     tags: [成员管理]
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
 *       - name: memberMapId
 *         in: path
 *         required: true
 *         description: 成员映射ID
 *         schema:
 *           type: integer
 *           format: int64
 *         example: 1
 *     responses:
 *       200:
 *         description: 操作成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: 圈主不能被移除或离开，请通过"删除守护圈"功能来解散
 *       401:
 *         description: 未授权访问
 *       403:
 *         description: 权限不足，无法移除该成员
 *       404:
 *         description: 在当前守护圈中未找到该成员
 *       500:
 *         description: 服务器内部错误
 */
router.delete('/:circleId/:memberMapId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId, memberMapId } = req.params;
        const { id: requestingUserId, role: requestingUserRole } = req.user;

        // 1. 获取要删除的目标成员信息
        const targetMember = await memberUtil.findMemberByMapId(memberMapId);
        if (!targetMember || targetMember.circle_id != circleId) {
            return res.status(404).json({ code: 404, message: '在当前守护圈中未找到该成员', data: null, error: null });
        }

        // 2. 核心业务规则：圈主不能被移除
        if (targetMember.uid === targetMember.creator_uid) {
            return res.status(400).json({ code: 400, message: '圈主不能被移除或离开，请通过"删除守护圈"功能来解散', data: null, error: null });
        }

        // 3. 权限判断
        let canDelete = false;
        if (requestingUserRole >= 2) { // 系统管理员
            canDelete = true;
        } else {
            // 用户可以自己离开
            if (targetMember.uid === requestingUserId) {
                canDelete = true;
            } else {
                // 首先检查是否是圈子创建者
                const circle = await circleUtil.findCircleById(circleId);
                if (circle && circle.creator_uid === req.user.uid) {
                    canDelete = true;
                } else {
                    // 圈主可以移除别人
                    const requestingUserMembership = await memberUtil.getMembership(requestingUserId, circleId);
                    if (requestingUserMembership && requestingUserMembership.member_role === 0) {
                        canDelete = true;
                    }
                }
            }
        }

        if (!canDelete) {
            return res.status(403).json({ code: 403, message: '权限不足，无法移除该成员', data: null, error: null });
        }

        // 4. 执行删除
        await memberUtil.removeMember(memberMapId);
        res.json({ code: 200, message: '操作成功', data: null, error: null });

    } catch (error) {
        next(error);
    }
});

export default router;
