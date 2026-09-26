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
  // Timetable entries are stored as Lectures.
  Lecture: '/timetable',
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

/**
 * The user accounts that may see a record owned by `owner`, mirroring the
 * read rule in getVisibleUserIds: a record owned by a normal user is readable
 * only by that user, a record owned by an admin by every normal user.
 * Admin accounts are handled separately, by otherAdminRecipients below.
 */
const contentRecipients = async (owner) => {
  if (!owner?._id) return [];
  if (owner.role === 'collaborator') return User.find({ role: 'user' }).select('_id');
  return [owner];
};

/**
 * Every admin (collaborator) EXCEPT the one who performed the action.
 *
 * Admins share one workspace: when one of them changes shared content the
 * others must hear about it through the same in-app notification system they
 * already use (bell, notifications page, unread badge) - the acting admin is
 * excluded so nobody is notified about their own action.
 */
const otherAdminRecipients = async (actor) => {
  if (!actor?._id || actor.role !== 'collaborator') return [];
  const admins = await User.find({ role: 'collaborator' }).select('_id');
  return admins.filter((admin) => String(admin._id) !== String(actor._id));
};

/** "Admin Sohaib" / "An admin" when the actor's name is unknown. */
const actorName = (actor) => (actor?.name ? `Admin ${actor.name}` : 'An admin');

/** Human-readable name of a content type, as shown in the notification. */
const contentName = (entityType) => {
  switch (entityType) {
    case 'Essential':
      return 'Essential';
    case 'Announcement':
      return 'Announcement';
    case 'Task':
      return 'Task';
    case 'Quiz':
      return 'Quiz';
    case 'Assignment':
      return 'Assignment';
    case 'Lecture':
      return 'Timetable Entry';
    default:
      return 'Item';
  }
};

/**
 * An admin published new content, or edited content that already exists.
 * Every regular user is notified, because getVisibleUserIds() already makes
 * admin-created records visible to all normal users, so they can all act on
 * the notification's link. The other admins are notified too, because
 * admin-created content is shared between admins: they all work on, and can
 * now edit, that one record, so they need to know it changed.
 *
 * Only collaborator actions fan out: content a normal user creates stays
 * private to that user (see getVisibleUserIds), so notifying everyone about it
 * would leak a record they cannot open.
 *
 * `action` is 'added' or 'updated'. Failures are swallowed on purpose, same as
 * createActivity, so a notification can never break the underlying write.
 */
export const notifyContentChange = async ({ entityType, entity, actor, action }) => {
  try {
    if (actor?.role !== 'collaborator') return [];
    if (!entity?._id) return [];

    const recipients = await contentRecipients(actor);
    const admins = await otherAdminRecipients(actor);
    if (recipients.length === 0 && admins.length === 0) return [];

    const isAdd = action === 'added';
    const name = contentName(entityType);
    const link = entityLink(entityType, entity._id);
    // Timetable entries are Lectures and have no `title`; the subject names them.
    const entityTitle = entity.title || entity.subject || 'Untitled';
    const adminVerb = isAdd ? 'created a new' : 'updated a';

    const notifications = [
      // Users keep the wording they have always had. The actor is filtered out
      // defensively: an admin is never in this list, but nobody should ever be
      // notified about their own action.
      ...recipients
        .filter((recipient) => recipient?._id && String(recipient._id) !== String(actor._id))
        .map((recipient) =>
          createNotification({
            recipient: recipient._id,
            actor: actor._id,
            type: isAdd ? 'CONTENT_ADDED' : 'CONTENT_UPDATED',
            title: isAdd ? `New ${name} Added` : `${name} Updated`,
            message: `"${entityTitle}" has been ${isAdd ? 'added' : 'updated'}.`,
            entityType,
            entityId: entity._id,
            link,
            metadata: { contentName: name, action, entityTitle },
            // A create is a one-off event, so a stable key means a retried
            // request can never notify twice. An update may legitimately
            // happen many times, so its key is scoped to the exact write.
            dedupeKey: isAdd
              ? `added:${entityType}:${entity._id}:${recipient._id}`
              : `updated:${entityType}:${entity._id}:${recipient._id}:${entity.updatedAt}`,
          })
        ),
      // Other admins: same event, worded so it is clear another admin did it.
      // Namespaced keys keep these apart from the user notifications above,
      // because dedupeKey is globally unique.
      ...admins.map((admin) =>
        createNotification({
          recipient: admin._id,
          actor: actor._id,
          type: isAdd ? 'CONTENT_ADDED' : 'CONTENT_UPDATED',
          title: isAdd ? `New ${name} Added` : `${name} Updated`,
          message: `${actorName(actor)} ${adminVerb} ${name.toLowerCase()}: "${entityTitle}".`,
          entityType,
          entityId: entity._id,
          link,
          metadata: { contentName: name, action, entityTitle, audience: 'admin' },
          dedupeKey: isAdd
            ? `admin-added:${entityType}:${entity._id}:${admin._id}`
            : `admin-updated:${entityType}:${entity._id}:${admin._id}:${entity.updatedAt}`,
        })
      ),
    ];
    return (await Promise.all(notifications)).filter(Boolean);
  } catch (error) {
    console.error('Error notifying users of content change:', error.message);
    return [];
  }
};

/**
 * An item flipped between complete and incomplete.
 *
 * Recipients follow the same visibility rule the read endpoints use
 * (getVisibleUserIds): a record owned by a normal user is readable only by
 * that user, while a record owned by a collaborator is readable by every
 * normal user. Admin accounts are never recipients.
 *
 * Call this only for a real transition (wasCompleted !== isCompleted), so
 * Pending -> In Progress and Completed -> Completed stay silent. Failures are
 * swallowed for the same reason as everywhere else in this service.
 */
export const notifyStatusChange = async ({ entityType, entity, owner, wasCompleted }) => {
  try {
    if (!entity?._id || !owner?._id) return [];

    const recipients = await contentRecipients(owner);
    const admins = await otherAdminRecipients(owner);
    if (recipients.length === 0 && admins.length === 0) return [];

    // The caller only invokes this for a real transition, so the new state is
    // simply the opposite of the previous one.
    const isCompleted = !wasCompleted;
    const name = contentName(entityType);
    const link = entityLink(entityType, entity._id);
    const entityTitle = entity.title || entity.subject || 'Untitled';

    const created = await Promise.all([
      ...recipients
        .filter((recipient) => recipient?._id)
        .map((recipient) =>
          createNotification({
            recipient: recipient._id,
            actor: owner._id,
            type: isCompleted ? 'CONTENT_COMPLETED' : 'CONTENT_REOPENED',
            title: isCompleted ? `${name} Completed` : `${name} Reopened`,
            message: `"${entityTitle}" has been marked as ${isCompleted ? 'complete' : 'incomplete'}.`,
            entityType,
            entityId: entity._id,
            link,
            metadata: { contentName: name, status: isCompleted ? 'Completed' : 'Incomplete', entityTitle },
            // Deliberately no dedupeKey here. The call site runs once per
            // request, so a single status change already yields exactly one
            // notification, and a stable key would swallow the next real
            // toggle. A key built from entity.updatedAt is not safe either:
            // that is millisecond-resolution, so two toggles in the same
            // millisecond would collide and lose a notification.
          })
        ),
      // Other admins share the record, so a completion made by one admin is
      // visible work-in-progress for all of them.
      ...admins.map((admin) =>
        createNotification({
          recipient: admin._id,
          actor: owner._id,
          type: isCompleted ? 'CONTENT_COMPLETED' : 'CONTENT_REOPENED',
          title: isCompleted ? `${name} Completed` : `${name} Reopened`,
          message: `${actorName(owner)} marked ${name.toLowerCase()} "${entityTitle}" as ${isCompleted ? 'complete' : 'incomplete'}.`,
          entityType,
          entityId: entity._id,
          link,
          metadata: { contentName: name, status: isCompleted ? 'Completed' : 'Incomplete', entityTitle, audience: 'admin' },
        })
      ),
    ]);
    return created.filter(Boolean);
  } catch (error) {
    console.error('Error notifying users of status change:', error.message);
    return [];
  }
};

/**
 * An admin pinned an announcement, which promotes it to the top of the list.
 * Recipients follow the same visibility rule as every other content
 * notification, so a private announcement still only reaches its owner.
 *
 * Call this only after the pin has actually been persisted, and only for the
 * unpinned -> pinned direction; unpinning is deliberately silent.
 */
export const notifyAnnouncementPinned = async (announcement, owner) => {
  try {
    if (!announcement?._id) return [];

    const recipients = await contentRecipients(owner);
    const admins = await otherAdminRecipients(owner);
    if (recipients.length === 0 && admins.length === 0) return [];

    const created = await Promise.all([
      ...recipients
        .filter((recipient) => recipient?._id)
        .map((recipient) =>
          createNotification({
            recipient: recipient._id,
            actor: owner?._id,
            type: 'CONTENT_PINNED',
            title: 'Announcement Pinned',
            message: `"${announcement.title}" has been pinned.`,
            entityType: 'Announcement',
            entityId: announcement._id,
            link: entityLink('Announcement', announcement._id),
            metadata: { contentName: 'Announcement', entityTitle: announcement.title },
          })
        ),
      ...admins.map((admin) =>
        createNotification({
          recipient: admin._id,
          actor: owner?._id,
          type: 'CONTENT_PINNED',
          title: 'Announcement Pinned',
          message: `${actorName(owner)} pinned announcement "${announcement.title}".`,
          entityType: 'Announcement',
          entityId: announcement._id,
          link: entityLink('Announcement', announcement._id),
          metadata: { contentName: 'Announcement', entityTitle: announcement.title, audience: 'admin' },
        })
      ),
    ]);
    return created.filter(Boolean);
  } catch (error) {
    console.error('Error notifying users of pinned announcement:', error.message);
    return [];
  }
};

/**
 * A registration was submitted (brand new, or re-applied by someone who was
 * previously rejected) -> every admin (collaborator) gets one in-app
 * notification, so the admin is told through the existing notification system
 * (bell popover, notifications page, unread badge) in addition to the email
 * that mailService already sends.
 *
 * This is the same fan-out shape as notifyContributionSubmitted, and it reuses
 * the REGISTRATION_SUBMITTED type the notification UI already renders. The
 * dedupe key includes the moment the application was submitted, so a genuine
 * re-application produces a new notice while a repeated submission of the same
 * application can never produce a second copy.
 */
export const notifyAdminsOfRegistrationSubmitted = async (user, { isReapplication = false } = {}) => {
  try {
    if (!user?._id) return [];
    const submittedAt = user.lastApplicationAt ? new Date(user.lastApplicationAt).getTime() : 0;
    const applicantName = user.name || 'A new user';
    const applicantEmail = user.email || '';

    const admins = await User.find({ role: 'collaborator' }).select('_id');
    const created = await Promise.all(
      admins
        .filter((admin) => String(admin._id) !== String(user._id))
        .map((admin) =>
          createNotification({
            recipient: admin._id,
            actor: user._id,
            type: 'REGISTRATION_SUBMITTED',
            title: isReapplication ? 'New Application Received' : 'New Registration Received',
            message: `${applicantName} (${applicantEmail}) submitted a registration and is awaiting approval.`,
            entityType: 'User',
            entityId: user._id,
            link: `/users?highlight=${user._id}`,
            metadata: {
              status: user.status || 'Pending Approval',
              userName: applicantName,
              userEmail: applicantEmail,
              isReapplication: Boolean(isReapplication),
              actionLabel: 'View/Review',
            },
            dedupeKey: `registration-submitted:${user._id}:${submittedAt}:${admin._id}`,
          })
        )
    );
    return created.filter(Boolean);
  } catch (error) {
    console.error('Error notifying admins of new registration:', error.message);
    return [];
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
 *
 * Two audiences, one event: the contributor is told their item is live, and
 * every OTHER admin is told that a new piece of shared content was published.
 * The published record is owned by the approving admin but readable by all
 * admins (getVisibleUserIds), so the other admins need to know it exists - the
 * same rule as notifyContentChange, reached through the approval workflow.
 */
export const notifyContributionApproved = async (contribution, admin, entity) => {
  const publishedId = entity?._id || contribution.finalEntity || null;
  const publishedLink = entityLink(contribution.type, publishedId);

  const contributorNotice = createNotification({
    recipient: contribution.user,
    actor: admin?._id,
    type: 'CONTRIBUTION_PUBLISHED',
    title: 'Contribution Published',
    message: `Your contributed ${label(contribution.type)} "${contribution.title}" has been approved and published.`,
    entityType: contribution.type,
    entityId: publishedId,
    link: publishedLink,
    metadata: { contributionType: contribution.type, title: contribution.title, contributionId: contribution._id },
    dedupeKey: `approved:${contribution._id}`,
  });

  const otherAdmins = await otherAdminRecipients(admin);
  const adminNotices = otherAdmins.map((other) =>
    createNotification({
      recipient: other._id,
      actor: admin?._id,
      type: 'CONTENT_ADDED',
      title: `New ${contentName(contribution.type)} Added`,
      message: `${actorName(admin)} published a contributed ${label(contribution.type)}: "${contribution.title}".`,
      entityType: contribution.type,
      entityId: publishedId,
      link: publishedLink,
      metadata: {
        contentName: contentName(contribution.type),
        action: 'added',
        entityTitle: contribution.title,
        audience: 'admin',
        contributionId: contribution._id,
      },
      // Namespaced so it can never collide with the contributor notice or with
      // a plain admin-created item; still stable, so a retried approval
      // request cannot produce a second copy.
      dedupeKey: `admin-approved:${contribution._id}:${other._id}`,
    })
  );

  const created = await Promise.all([contributorNotice, ...adminNotices]);
  return created.filter(Boolean);
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
