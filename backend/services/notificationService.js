import Notification from '../models/Notification.js';
import Contribution from '../models/Contribution.js';
import User from '../models/User.js';

/**
 * Central, server-side notification service.
 *
 * Every notification is created from a real workflow action (contribution
 * submitted / approved / rejected / updated / removed). Nothing here is
 * reachable from the public API, so a client can never fabricate a
 * notification for another user.
 *
 * Failures are logged and swallowed on purpose: a notification must never
 * break the underlying action (same approach as createActivity).
 */

const ENTITY_ROUTES = {
  Task: '/tasks',
  Quiz: '/quizzes',
  Assignment: '/assignments',
  Essential: '/essentials',
  Announcement: '/announcements',
};

const label = (type) => {
  switch (type) {
    case 'Essential':
      return 'essential';
    case 'Announcement':
      return 'announcement';
    case 'Task':
      return 'task';
    case 'Quiz':
      return 'quiz';
    case 'Assignment':
      return 'assignment';
    default:
      return 'item';
  }
};

const entityLink = (entityType, entityId) => {
  const route = ENTITY_ROUTES[entityType];
  if (!route || !entityId) return '';
  return `${route}?highlight=${entityId}`;
};

/**
 * Create one notification. When `dedupeKey` is provided the insert is an
 * upsert, so re-running the same event (retry, double click, refetch of a
 * workflow step) can never produce a second copy.
 */
export const createNotification = async ({ recipient, actor, type, title, message = '', entityType = '', entityId = null, link = '', metadata = {}, dedupeKey = null }) => {
  try {
    if (!recipient) return null;
    const payload = { recipient, actor: actor || null, type, title, message, entityType, entityId, link, metadata };
    if (!dedupeKey) {
      return await Notification.create(payload);
    }
    return await Notification.findOneAndUpdate(
      { dedupeKey },
      { $setOnInsert: { ...payload, dedupeKey } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error('Error creating notification:', error.message);
    return null;
  }
};

/** User submitted a contribution -> every admin (collaborator) is notified once. */
export const notifyContributionSubmitted = async (contribution, actor) => {
  try {
    const admins = await User.find({ role: 'collaborator' }).select('_id');
    const created = await Promise.all(
      admins
        .filter((admin) => String(admin._id) !== String(actor?._id || ''))
        .map((admin) =>
          createNotification({
            recipient: admin._id,
            actor: actor?._id,
            type: 'CONTRIBUTION_SUBMITTED',
            title: 'New Contribution',
            message: `${actor?.name || 'A contributor'} submitted a new ${label(contribution.type)} "${contribution.title}" for review.`,
            entityType: 'Contribution',
            entityId: contribution._id,
            link: `/approvals?highlight=${contribution._id}`,
            metadata: { contributionType: contribution.type, title: contribution.title },
            dedupeKey: `submitted:${contribution._id}:${admin._id}`,
          })
        )
    );
    return created.filter(Boolean);
  } catch (error) {
    console.error('Error notifying admins of contribution:', error.message);
    return [];
  }
};

/**
 * Admin approved the contribution. The existing workflow publishes the item in
 * the very same action, so a single CONTRIBUTION_PUBLISHED notification keeps
 * the wording accurate without duplicating the approval message.
 */
export const notifyContributionApproved = async (contribution, admin, entity) => {
  return createNotification({
    recipient: contribution.user,
    actor: admin?._id,
    type: 'CONTRIBUTION_PUBLISHED',
    title: 'Contribution Published',
    message: `Your contributed ${label(contribution.type)} "${contribution.title}" has been approved and published.`,
    entityType: contribution.type,
    entityId: entity?._id || contribution.finalEntity || null,
    link: entityLink(contribution.type, entity?._id || contribution.finalEntity),
    metadata: { contributionType: contribution.type, title: contribution.title, contributionId: contribution._id },
    dedupeKey: `approved:${contribution._id}`,
  });
};

export const notifyContributionRejected = async (contribution, admin) => {
  const reason = contribution.rejectionReason ? ` Reason: ${contribution.rejectionReason}` : '';
  return createNotification({
    recipient: contribution.user,
    actor: admin?._id,
    type: 'CONTRIBUTION_REJECTED',
    title: 'Contribution Rejected',
    message: `Your contributed ${label(contribution.type)} "${contribution.title}" was rejected by an admin.${reason}`,
    entityType: 'Contribution',
    entityId: contribution._id,
    link: `/contribute?highlight=${contribution._id}`,
    metadata: { contributionType: contribution.type, title: contribution.title, contributionId: contribution._id, rejectionReason: contribution.rejectionReason || '' },
    dedupeKey: `rejected:${contribution._id}`,
  });
};

/** An admin edited a published contribution -> only the contributor is notified. */
export const notifyContributionUpdated = async ({ entityType, entity, admin }) => {
  const contributor = entity?.contributor;
  if (!contributor || String(contributor._id || contributor) === String(admin?._id)) return null;
  return createNotification({
    recipient: contributor._id || contributor,
    actor: admin?._id,
    type: 'CONTRIBUTION_UPDATED',
    title: 'Contribution Updated',
    message: `Your contributed ${label(entityType)} "${entity.title}" has been updated by an admin.`,
    entityType,
    entityId: entity._id,
    link: entityLink(entityType, entity._id),
    metadata: { contributionType: entityType, title: entity.title },
  });
};

/** A published contribution was removed -> contributor keeps an accurate trail. */
export const notifyContributionDeleted = async ({ contribution, actor }) => {
  return createNotification({
    recipient: contribution.user,
    actor: actor?._id,
    type: 'CONTRIBUTION_DELETED',
    title: 'Contribution Removed',
    message: `Your published ${label(contribution.type)} "${contribution.title}" has been removed by an admin.`,
    entityType: 'Contribution',
    entityId: contribution._id,
    link: `/contribute?highlight=${contribution._id}`,
    metadata: { contributionType: contribution.type, title: contribution.title, contributionId: contribution._id },
    dedupeKey: `deleted:${contribution._id}`,
  });
};

/**
 * Called right before an admin deletes a published entity. The contribution
 * record still points at the entity here, so the contributor can be notified
 * before the link is gone.
 */
export const notifyContributorsOfDeletedEntity = async ({ entityType, entityId, actor }) => {
  try {
    const contributions = await Contribution.find({ finalEntity: entityId, status: 'Approved' }).select('user type title');
    await Promise.all(contributions.map((contribution) => notifyContributionDeleted({ contribution, actor })));
  } catch (error) {
    console.error('Error notifying contributors of deleted item:', error.message);
  }
};
