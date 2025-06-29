import express from 'express';
import authorize from '../auth/authUtils.js';
import memberUtil from './memberUtil.js';
import circleUtil from './circleUtil.js';

const router = express.Router();

/**
 * @api {POST} /api/guardian/member/join - 通过邀请码加入守护圈
 * @description 用户输入6位邀请码加入一个守护圈。
 * @permission 任意登录用户 (role=1, 2)
 * @body {string} circle_code - 守护圈的6位邀请码 (必填)
 * @body {string} [member_alias] - 在圈内的昵称 (选填, 默认为用户自己的昵称)
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
 * @api {GET} /api/guardian/member/:circleId - 获取守护圈成员列表
 * @description 获取指定守护圈的所有成员信息。
 * @permission 圈内成员 或 系统管理员(role=2)
 */
router.get('/:circleId', authorize([1, 2]), async (req, res, next) => {
    try {
        const { circleId } = req.params;
        const { id: requestingUserId, role: requestingUserRole } = req.user;

        // 权限检查：必须是圈内成员或系统管理员
        if (requestingUserRole < 2) {
            const membership = await memberUtil.getMembership(requestingUserId, circleId);
            if (!membership) {
                return res.status(403).json({ code: 403, message: '权限不足，您不是该守护圈的成员', data: null, error: null });
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
 * @api {PUT} /api/guardian/member/:circleId/:memberMapId - 更新成员信息
 * @description 更新成员的昵称或角色。
 * @permission 系统管理员(role=2) / 圈主(member_role=0) / 成员自己 (只能改昵称)
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
 * @api {DELETE} /api/guardian/member/:circleId/:memberMapId - 移出或离开守护圈
 * @description 圈主移除成员，或成员自己离开圈子。
 * @permission 系统管理员(role=2) / 圈主(member_role=0) / 成员自己
 * @businessrule 圈子的创建者不能被移除或离开，必须通过删除守护圈接口。
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
                // 圈主可以移除别人
                const requestingUserMembership = await memberUtil.getMembership(requestingUserId, circleId);
                if (requestingUserMembership && requestingUserMembership.member_role === 0) {
                    canDelete = true;
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
