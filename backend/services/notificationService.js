import Notification from '../models/Notification.js';
import Contribution from '../models/Contribution.js';
import User from '../models/User.js';
import { sendContentChangeEmail, sendContributionSubmittedEmail } from './mailService.js';

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
 * The USER accounts that may see a record owned by `owner`, mirroring the read
 * rule in getVisibleUserIds: a record owned by a normal user is readable only by
 * that user, a record owned by a collaborator by every normal user. Admin
 * accounts are handled separately, by otherAdminRecipients below.
 */
const contentRecipients = async (owner) => {
  if (!owner?._id) return [];
  if (owner.role === 'collaborator') return User.find({ role: 'user' }).select('_id');
  return [owner];
};

/**
 * The OTHER admins, i.e. everyone in the shared admin workspace except the one
 * who performed the action. This is the admin-to-admin fan-out: an admin action
 * is a shared action, so the rest of the team is told about it through the same
 * notification system they already use. The acting admin is never a recipient
 * of their own action.
 */
const otherAdminRecipients = async (actor) => {
  if (!actor?._id) return [];
  const admins = await User.find({ role: 'collaborator' }).select('_id name');
  return admins.filter((admin) => String(admin._id) !== String(actor._id));
};

/** "Admin Sohaib" when the name is known, otherwise a neutral "An admin". */
const actorLabel = (actor) => (actor?.name ? `Admin ${actor.name}` : 'An admin');

/** Lower-case noun used in the admin-facing sentence, e.g. "timetable entry". */
const contentNoun = (entityType) => {
  switch (entityType) {
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
    case 'Lecture':
      return 'timetable entry';
    default:
      return 'item';
  }
};

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
 *
 * Recipients are BOTH audiences of a shared admin action:
 *
 *   - every regular user, because getVisibleUserIds() already makes
 *     admin-created records visible to all normal users, so they can all act on
 *     the notification's link;
 *   - every OTHER admin, because all admins work in one shared workspace and a
 *     change made by one of them is a change to everyone's content. The acting
 *     admin is explicitly excluded, so nobody is notified of their own action.
 *
 * Only collaborator actions fan out: content a normal user creates stays
 * private to that user (see getVisibleUserIds), so notifying everyone about it
 * would leak a record they cannot open.
 *
 * `action` is 'added' or 'updated'. Failures are swallowed on purpose, same as
 * createActivity, so a notification can never break the underlying write.
 *
 * The call also sends an email for the event, through the existing mail service
 * and its existing template. An add always produces one email, and a timetable
 * update produces one too; any other update stays silent. The email goes to
 * every account that can open the link EXCEPT the administrator who performed
 * the action, who is not a recipient of their own action.
 */
export const notifyContentChange = async ({ entityType, entity, actor, action }) => {
  try {
    if (actor?.role !== 'collaborator') return [];
    if (!entity?._id) return [];

    // The same event also goes out as email, through the existing mail service
    // and its existing template. It is deliberately narrower than the in-app
    // rules above in one way and wider in another:
    //
    //   - it is sent for content that was just added, and for a timetable that
    //     was added or updated, and nothing else, so an ordinary edit of a task,
    //     quiz, assignment, essential or announcement stays silent;
    //   - every account that can open the link is told, so the rest of the admin
    //     team learns about shared content the same way the other admins are,
    //     and the same way the recipient list already works for the in-app
    //     notification to the other admins;
    //   - the administrator who performed the action is NOT a recipient. That is
    //     the one difference from the user list: they already know, and the rule
    //     is simply not to notify someone of their own action. The address is
    //     dropped from the recipient list before anything is sent, so it is never
    //     opened as a recipient and no delivery record is written for it.
    //
    // Each recipient gets their own copy of the message, so nobody sees anybody
    // else's address.
    //
    // It runs BEFORE the in-app fan-out on purpose: the in-app rules return
    // early when there is nobody to tell, and the email must still reach a
    // single-admin deployment. Its own try/catch keeps it from ever changing
    // what happens next - nothing below behaves differently because of it, and
    // the in-app notifications keep the exact wording and exclusions they have
    // always had.
    if (action === 'added' || entityType === 'Lecture') {
      try {
        await sendContentChangeEmail({ entityType, entity, action, excludeEmails: [actor?.email] });
      } catch (error) {
        console.error('Error sending the content notification email:', error.message);
      }
    }

    const [userRecipients, adminRecipients] = await Promise.all([
      contentRecipients(actor),
      otherAdminRecipients(actor),
    ]);
    if (userRecipients.length === 0 && adminRecipients.length === 0) return [];

    const isAdd = action === 'added';
    const name = contentName(entityType);
    const link = entityLink(entityType, entity._id);
    const verb = isAdd ? 'added' : 'updated';
    // Timetable entries are Lectures and have no `title`; the subject names them.
    const entityTitle = entity.title || entity.subject || 'Untitled';
    const who = actorLabel(actor);
    const noun = contentNoun(entityType);

    const created = await Promise.all([
      // Regular users keep the exact wording they have always received.
      ...userRecipients
        .filter((recipient) => recipient?._id && String(recipient._id) !== String(actor._id))
        .map((recipient) =>
          createNotification({
            recipient: recipient._id,
            actor: actor._id,
            type: isAdd ? 'CONTENT_ADDED' : 'CONTENT_UPDATED',
            title: isAdd ? `New ${name} Added` : `${name} Updated`,
            message: `"${entityTitle}" has been ${verb}.`,
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
      // Other admins are told that a colleague - named, not just "an admin" -
      // changed shared content. Same dedupe guarantees as above.
      ...adminRecipients.map((admin) =>
        createNotification({
          recipient: admin._id,
          actor: actor._id,
          type: isAdd ? 'CONTENT_ADDED' : 'CONTENT_UPDATED',
          title: isAdd ? `${name} Added by an Admin` : `${name} Updated by an Admin`,
          message: isAdd
            ? `${who} created a new ${noun}: "${entityTitle}".`
            : `${who} updated the ${noun} "${entityTitle}".`,
          entityType,
          entityId: entity._id,
          link,
          metadata: { contentName: name, action, entityTitle, actorName: actor?.name || '' },
          dedupeKey: isAdd
            ? `added:${entityType}:${entity._id}:${admin._id}`
            : `updated:${entityType}:${entity._id}:${admin._id}:${entity.updatedAt}`,
        })
      ),
    ]);
    return created.filter(Boolean);
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

    // Other admins are included only when an ADMIN changed shared content;
    // a normal user completing their own private task notifies nobody else.
    const [recipients, adminRecipients] = await Promise.all([
      contentRecipients(owner),
      owner.role === 'collaborator' ? otherAdminRecipients(owner) : [],
    ]);
    if (recipients.length === 0 && adminRecipients.length === 0) return [];

    // The caller only invokes this for a real transition, so the new state is
    // simply the opposite of the previous one.
    const isCompleted = !wasCompleted;
    const name = contentName(entityType);
    const link = entityLink(entityType, entity._id);
    const entityTitle = entity.title || entity.subject || 'Untitled';
    const who = actorLabel(owner);

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
      ...adminRecipients.map((admin) =>
        createNotification({
          recipient: admin._id,
          actor: owner._id,
          type: isCompleted ? 'CONTENT_COMPLETED' : 'CONTENT_REOPENED',
          title: isCompleted ? `${name} Completed by an Admin` : `${name} Reopened by an Admin`,
          message: `${who} marked the ${contentNoun(entityType)} "${entityTitle}" as ${isCompleted ? 'complete' : 'incomplete'}.`,
          entityType,
          entityId: entity._id,
          link,
          metadata: { contentName: name, status: isCompleted ? 'Completed' : 'Incomplete', entityTitle, actorName: owner?.name || '' },
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

    const [recipients, adminRecipients] = await Promise.all([
      contentRecipients(owner),
      owner?.role === 'collaborator' ? otherAdminRecipients(owner) : [],
    ]);
    if (recipients.length === 0 && adminRecipients.length === 0) return [];

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
      ...adminRecipients.map((admin) =>
        createNotification({
          recipient: admin._id,
          actor: owner?._id,
          type: 'CONTENT_PINNED',
          title: 'Announcement Pinned by an Admin',
          message: `${actorLabel(owner)} pinned the announcement "${announcement.title}".`,
          entityType: 'Announcement',
          entityId: announcement._id,
          link: entityLink('Announcement', announcement._id),
          metadata: { contentName: 'Announcement', entityTitle: announcement.title, actorName: owner?.name || '' },
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

/**
 * User submitted a contribution -> every admin (collaborator) is notified once,
 * in the app and by email. The contributor is never a recipient of their own
 * submission.
 */
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

    // The same event also goes out as email, to the same administrators the
    // in-app notice above goes to and nobody else: the person who submitted it
    // does not get their own notification, and other users are not told about a
    // contribution that is still pending and that they cannot read.
    //
    // The contribution has already been stored when this runs, so the email can
    // never claim something the workflow did not do, and the approval decision
    // below is entirely unaffected by it.
    try {
      await sendContributionSubmittedEmail({ contribution, contributor: actor });
    } catch (error) {
      console.error('Error sending the contribution submitted email:', error.message);
    }

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

/**
 * The same publication, told to the OTHER admins. Publishing turns a
 * contribution into shared content that every admin can now see, edit and
 * delete, so the rest of the team learns who published it and where - the
 * admin-to-admin half of the existing publication notification. The approving
 * admin is not a recipient, and the contributor still gets exactly the one
 * notification notifyContributionApproved sends them.
 *
 * Publication is also the moment the item becomes content every approved user
 * can see, so the ordinary content email goes out for it here - to every approved
 * user and the other admins, and to neither the approving admin nor the
 * contributor, who are the two people who already know. That happens before the
 * early return below for the same reason as everywhere else: a single-admin
 * deployment still has users to tell.
 */
export const notifyAdminsOfPublishedContribution = async (contribution, admin, entity) => {
  try {
    // The contributor is populated by the caller; fall back to the stored id so
    // the exclusion cannot silently fail and email them about their own item.
    let contributorEmail = typeof contribution.user === 'object' ? contribution.user?.email || '' : '';
    if (!contributorEmail && contribution.user) {
      const owner = await User.findById(contribution.user).select('email').lean();
      contributorEmail = owner?.email || '';
    }

    try {
      await sendContentChangeEmail({
        entityType: contribution.type,
        entity: entity || {},
        action: 'added',
        excludeEmails: [admin?.email, contributorEmail],
      });
    } catch (error) {
      console.error('Error sending the published contribution email:', error.message);
    }

    const admins = await otherAdminRecipients(admin);
    if (admins.length === 0) return [];

    const publishedId = entity?._id || contribution.finalEntity || null;
    const created = await Promise.all(
      admins.map((other) =>
        createNotification({
          recipient: other._id,
          actor: admin?._id,
          type: 'CONTRIBUTION_PUBLISHED',
          title: 'Contribution Published',
          message: `${actorLabel(admin)} published a contributed ${label(contribution.type)}: "${contribution.title}".`,
          entityType: contribution.type,
          entityId: publishedId,
          // Points at the published item itself, which is where the other
          // admins will now find it in the shared content lists.
          link: entityLink(contribution.type, publishedId),
          metadata: {
            contributionType: contribution.type,
            title: contribution.title,
            contributionId: contribution._id,
            actorName: admin?.name || '',
          },
          dedupeKey: `published-admin:${contribution._id}:${other._id}`,
        })
      )
    );
    return created.filter(Boolean);
  } catch (error) {
    console.error('Error notifying admins of published contribution:', error.message);
    return [];
  }
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
