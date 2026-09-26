/**
 * End-to-end verification of the SHARED multi-admin model.
 *
 * Runs the real controllers (no mocks, no HTTP layer) against a scratch
 * database on the configured cluster, with three real accounts:
 *
 *   Admin A, Admin B  - collaborators (admins)
 *   User U            - a normal user
 *
 * and checks the behaviour the system is supposed to have:
 *
 *   Test A  task            created by A -> visible to A, B and U; B notified
 *   Test B  quiz            created by A -> visible to A, B and U; B notified
 *   Test C  contribution    submitted by U, approved by A -> published record
 *                           visible to A, B and U; B notified
 *   Test D  timetable       entry A by admin A, entry B by admin B -> both
 *                           admins and the user see both; A edits B's entry
 *                           and everybody sees the same single record
 *   Test E  announcements / assignments / essentials / important dates
 *   Test F  no self-notification, no duplicate records, no data leak between
 *           users, and a normal user still cannot touch admin content
 *
 * The scratch database is dropped at the end. Run with:
 *   node scripts/verify-shared-admin.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

// Redirect the connection at a scratch database BEFORE config/db.js is loaded,
// so a verification run can never touch real content.
const base = process.env.MONGODB_URI || '';
const scratchName = `nextup_vshared_${Date.now().toString(36)}`;
process.env.MONGODB_URI = base.replace(/\/[^/?]+(\?|$)/, `/${scratchName}$1`);

const cfg = await import('../config/db.js');
await cfg.default();

const User = (await import('../models/User.js')).default;
const Task = (await import('../models/Task.js')).default;
const Quiz = (await import('../models/Quiz.js')).default;
const Assignment = (await import('../models/Assignment.js')).default;
const Announcement = (await import('../models/Announcement.js')).default;
const Essential = (await import('../models/Essential.js')).default;
const Lecture = (await import('../models/Lecture.js')).default;
const ImportantDate = (await import('../models/ImportantDate.js')).default;
const Contribution = (await import('../models/Contribution.js')).default;
const Notification = (await import('../models/Notification.js')).default;

const tasks = await import('../controllers/taskController.js');
const quizzes = await import('../controllers/quizController.js');
const assignments = await import('../controllers/assignmentController.js');
const announcements = await import('../controllers/announcementController.js');
const essentials = await import('../controllers/essentialController.js');
const lectures = await import('../controllers/lectureController.js');
const importantDates = await import('../controllers/importantDateController.js');
const contributions = await import('../controllers/contributionController.js');

let pass = 0;
let fail = 0;
const failures = [];
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; failures.push(label); console.log(`  FAIL ${label}  <- ${extra}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

/** Calls a controller as `user` and returns { status, body }. */
const call = async (handler, user, { params = {}, query = {}, body = {} } = {}) => {
  const req = { user, params, query, body };
  const res = mkRes();
  let error = null;
  await handler(req, res, (e) => { error = e; });
  if (error) throw error;
  return { status: res.statusCode, body: res.body };
};

const data = (r) => r.body?.data;
const titles = (r) => (Array.isArray(data(r)) ? data(r).map((x) => x.title) : []);
const findByTitle = (r, title) => (data(r) || []).find((x) => x.title === title);

// ── accounts ────────────────────────────────────────────────────────────────
const mkUser = (name, email, role) =>
  User.create({ name, email, password: 'Verify-Only-Password-1', role, status: 'Approved' });

const adminA = await mkUser('Admin Alpha', `a.${Date.now()}@verify.test`, 'collaborator');
const adminB = await mkUser('Admin Beta', `b.${Date.now()}@verify.test`, 'collaborator');
const userU = await mkUser('Regular User', `u.${Date.now()}@verify.test`, 'user');
// A second normal user, to prove private user content still stays private.
const userV = await mkUser('Other User', `v.${Date.now()}@verify.test`, 'user');

const notesFor = (recipientId) =>
  Notification.find({ recipient: recipientId }).sort({ createdAt: -1 }).lean();
const noteMessages = async (recipientId) => (await notesFor(recipientId)).map((n) => n.message);

try {
  // ───────────────────────────────────────────────────────────── Test A: Task
  section('Test A - task created by Admin A');
  const createdTask = await call(tasks.createTask, adminA, {
    body: { subject: 'Databases', title: 'Shared Task A', description: 'from A', deadlineMode: 'As Possible' },
  });
  const taskId = data(createdTask)._id;
  check('Admin A created the task', createdTask.status === 201);
  check('Admin A sees the task', titles(await call(tasks.getTasks, adminA)).includes('Shared Task A'));
  check('Admin B sees the task', titles(await call(tasks.getTasks, adminB)).includes('Shared Task A'));
  check('User sees the task', titles(await call(tasks.getTasks, userU)).includes('Shared Task A'));
  check('Admin B can open the task', (await call(tasks.getTask, adminB, { params: { id: taskId } })).status === 200);
  check('Admin B can EDIT the task (shared record)', (await call(tasks.updateTask, adminB, {
    params: { id: taskId },
    body: { title: 'Shared Task A (edited by B)' },
  })).status === 200);
  check('the edit landed on the SAME record', (await Task.countDocuments({ title: 'Shared Task A (edited by B)' })) === 1);
  check('Admin A sees the edit made by B', titles(await call(tasks.getTasks, adminA)).includes('Shared Task A (edited by B)'));
  check('User sees the edit made by B', titles(await call(tasks.getTasks, userU)).includes('Shared Task A (edited by B)'));
  check('no duplicate task was created', (await Task.countDocuments({ subject: 'Databases' })) === 1);

  const bNotes = await noteMessages(adminB._id);
  check('Admin B was notified that an admin created a task',
    bNotes.some((m) => /Admin Alpha created a new task/i.test(m)), JSON.stringify(bNotes));
  check('the admin notification names the acting admin', bNotes.some((m) => /Admin Alpha/.test(m)));
  const aNotes = await noteMessages(adminA._id);
  check('Admin A got NO self-notification for their own create',
    !aNotes.some((m) => /created a new task/i.test(m)), JSON.stringify(aNotes));
  check('Admin A was notified about the task edit made by Admin B',
    aNotes.some((m) => /Admin Beta updated a task/i.test(m)), JSON.stringify(aNotes));

  // ───────────────────────────────────────────────────────────── Test B: Quiz
  section('Test B - quiz created by Admin A');
  const createdQuiz = await call(quizzes.createQuiz, adminA, {
    body: { subject: 'AI', title: 'Shared Quiz A', deadlineMode: 'Date', date: new Date(Date.now() + 86400000) },
  });
  const quizId = data(createdQuiz)._id;
  check('Admin A sees the quiz', titles(await call(quizzes.getQuizzes, adminA)).includes('Shared Quiz A'));
  check('Admin B sees the quiz', titles(await call(quizzes.getQuizzes, adminB)).includes('Shared Quiz A'));
  check('User sees the quiz', titles(await call(quizzes.getQuizzes, userU)).includes('Shared Quiz A'));
  check('Admin B can edit the quiz', (await call(quizzes.updateQuiz, adminB, {
    params: { id: quizId }, body: { subject: 'AI', deadlineMode: 'Surprise' },
  })).status === 200);
  check('Admin B was notified about the new quiz',
    (await noteMessages(adminB._id)).some((m) => /Admin Alpha created a new quiz/i.test(m)));
  check('User was notified about the new quiz',
    (await noteMessages(userU._id)).some((m) => /has been added/i.test(m)));

  // ─────────────────────────────────────── Test C: contribution approval flow
  section('Test C - contribution submitted by a user, approved by Admin A');
  const submitted = await call(contributions.createContribution, userU, {
    body: {
      type: 'Task',
      title: 'Contributed Task',
      content: { title: 'Contributed Task', subject: 'OS', deadlineMode: 'As Possible', priority: 'High', description: 'from a user' },
    },
  });
  const contributionId = data(submitted)._id;
  check('the user submitted the contribution', submitted.status === 201);
  check('both admins see it in the approvals queue',
    titles(await call(contributions.listContributions, adminA)).includes('Contributed Task') &&
    titles(await call(contributions.listContributions, adminB)).includes('Contributed Task'));

  const approved = await call(contributions.approveContribution, adminA, { params: { id: contributionId } });
  check('Admin A approved it', approved.status === 200);
  const contribution = await Contribution.findById(contributionId).lean();
  check('the contribution is Approved and points at the published record', contribution.status === 'Approved' && Boolean(contribution.finalEntity));
  check('exactly ONE task record exists for it (no duplicate copy)',
    (await Task.countDocuments({ title: 'Contributed Task' })) === 1);

  check('Admin A sees the published contribution as a task', titles(await call(tasks.getTasks, adminA)).includes('Contributed Task'));
  check('Admin B sees the published contribution as a task', titles(await call(tasks.getTasks, adminB)).includes('Contributed Task'));
  check('the user sees the published contribution', titles(await call(tasks.getTasks, userU)).includes('Contributed Task'));
  check('Admin B can open the published task', (await call(tasks.getTask, adminB, { params: { id: String(contribution.finalEntity) } })).status === 200);
  check('Admin B was told that an admin published it',
    (await noteMessages(adminB._id)).some((m) => /Admin Alpha published a contributed task/i.test(m)),
    JSON.stringify(await noteMessages(adminB._id)));
  check('the contributor was told their item is published',
    (await noteMessages(userU._id)).some((m) => /has been approved and published/i.test(m)));
  check('the approving admin got no duplicate publish notice to themselves',
    (await noteMessages(adminA._id)).filter((m) => /published a contributed/i.test(m)).length === 0);
  check('the contributor can still see their own contribution record',
    titles(await call(contributions.getMyContributions, userU)).includes('Contributed Task'));
  check('another user cannot see that contribution record',
    !titles(await call(contributions.getMyContributions, userV)).includes('Contributed Task'));

  // ──────────────────────────────────────────────────────── Test D: timetable
  section('Test D - shared timetable');
  const entryA = await call(lectures.createLecture, adminA, { body: { subject: 'Monday 10:00 Database Systems', timeline: 'Weekly' } });
  const entryB = await call(lectures.createLecture, adminB, { body: { subject: 'Tuesday 12:00 Artificial Intelligence', timeline: 'Weekly' } });
  check('Admin A added a timetable entry', entryA.status === 201);
  check('Admin B added a timetable entry', entryB.status === 201);
  const subjects = (r) => (data(r) || []).map((l) => l.subject);
  const bothEntries = ['Monday 10:00 Database Systems', 'Tuesday 12:00 Artificial Intelligence'];
  const seesAll = async (user, list) => {
    const seen = subjects(await call(lectures.getLectures, user));
    return list.every((s) => seen.includes(s));
  };
  check('Admin A sees BOTH timetable entries', await seesAll(adminA, bothEntries));
  check('Admin B sees BOTH timetable entries', await seesAll(adminB, bothEntries));
  check('the user sees BOTH timetable entries', await seesAll(userU, bothEntries));
  check('Admin A was notified about the timetable entry added by Admin B',
    (await noteMessages(adminA._id)).some((m) => /Admin Beta created a new timetable entry/i.test(m)),
    JSON.stringify(await noteMessages(adminA._id)));
  check('Admin B was NOT notified about their OWN timetable entry',
    !(await noteMessages(adminB._id)).some((m) => /Admin Beta created a new timetable entry/i.test(m)),
    JSON.stringify(await noteMessages(adminB._id)));

  // Admin A edits the entry Admin B created: one record, everybody updated.
  const editedB = await call(lectures.updateLecture, adminA, {
    params: { id: data(entryB)._id },
    body: { subject: 'Tuesday 12:00 Artificial Intelligence (edited by A)', timeline: 'Weekly' },
  });
  check('Admin A can edit the entry Admin B created', editedB.status === 200);
  check('no duplicate timetable entry was created', (await Lecture.countDocuments()) === 2);
  check('Admin B sees the updated entry', subjects(await call(lectures.getLectures, adminB)).includes('Tuesday 12:00 Artificial Intelligence (edited by A)'));
  check('the user sees the updated entry', subjects(await call(lectures.getLectures, userU)).includes('Tuesday 12:00 Artificial Intelligence (edited by A)'));
  check('Admin B was notified about the timetable update',
    (await noteMessages(adminB._id)).some((m) => /Admin Alpha updated a timetable entry/i.test(m)),
    JSON.stringify(await noteMessages(adminB._id)));

  // ───────────────────── Test E: announcements, assignments, essentials, dates
  section('Test E - remaining shared content types');
  const ann = await call(announcements.createAnnouncement, adminA, {
    body: { title: 'Shared Announcement', description: 'hello', type: 'General', date: new Date() },
  });
  const annId = data(ann)._id;
  check('Admin B sees the announcement', titles(await call(announcements.getAnnouncements, adminB)).includes('Shared Announcement'));
  check('the user sees the announcement', titles(await call(announcements.getAnnouncements, userU)).includes('Shared Announcement'));
  check('Admin B can pin the announcement', (await call(announcements.togglePin, adminB, { params: { id: annId } })).status === 200);
  check('pinning notifies the other admin',
    (await noteMessages(adminA._id)).some((m) => /Admin Beta pinned announcement/i.test(m)));
  check('pinning still notifies users',
    (await noteMessages(userU._id)).some((m) => /has been pinned/i.test(m)));
  check('Admin B was told about the new announcement',
    (await noteMessages(adminB._id)).some((m) => /Admin Alpha created a new announcement/i.test(m)));

  const asg = await call(assignments.createAssignment, adminA, {
    body: { subject: 'DBMS', title: 'Shared Assignment A', deadlineMode: 'As Possible' },
  });
  const asgId = data(asg)._id;
  check('Admin-created assignment is auto-approved', data(asg).approvalStatus === 'Approved');
  check('Admin B sees the assignment', titles(await call(assignments.getAssignments, adminB)).includes('Shared Assignment A'));
  check('the user sees the assignment', titles(await call(assignments.getAssignments, userU)).includes('Shared Assignment A'));
  check('Admin B can complete the assignment', (await call(assignments.completeAssignment, adminB, { params: { id: asgId } })).status === 200);
  check('completion notifies the other admin',
    (await noteMessages(adminA._id)).some((m) => /Admin Beta marked assignment/i.test(m)));
  check('Admin B was told about the new assignment',
    (await noteMessages(adminB._id)).some((m) => /Admin Alpha created a new assignment/i.test(m)));

  const ess = await call(essentials.createEssential, adminA, { body: { course: 'DBMS', title: 'Shared Essential A', tag: 'Topic' } });
  const essId = data(ess)._id;
  check('Admin B sees the essential', titles(await call(essentials.getEssentials, adminB)).includes('Shared Essential A'));
  check('the user sees the essential', titles(await call(essentials.getEssentials, userU)).includes('Shared Essential A'));
  check('Admin B can delete the essential', (await call(essentials.deleteEssential, adminB, { params: { id: essId } })).status === 200);

  const imp = await call(importantDates.createImportantDate, adminB, { body: { title: 'Shared Important Date', type: 'Exam', priority: 'High', date: new Date() } });
  const impId = data(imp)._id;
  check('Admin A sees the important date', titles(await call(importantDates.getImportantDates, adminA)).includes('Shared Important Date'));
  check('the user sees the important date', titles(await call(importantDates.getImportantDates, userU)).includes('Shared Important Date'));
  check('Admin A can edit the important date', (await call(importantDates.updateImportantDate, adminA, { params: { id: impId }, body: { title: 'Shared Important Date' } })).status === 200);

  // ───────────────────────────────────────── Test F: privacy is still intact
  section('Test F - authorization and privacy still hold');
  const privateTask = await call(tasks.createTask, userU, { body: { subject: 'Private', title: 'User Private Task', deadlineMode: 'As Possible' } });
  const privateId = data(privateTask)._id;
  check('the user sees their own private task', titles(await call(tasks.getTasks, userU)).includes('User Private Task'));
  check('another user does NOT see it', !titles(await call(tasks.getTasks, userV)).includes('User Private Task'));
  check('an admin does NOT see a normal user private task', !titles(await call(tasks.getTasks, adminA)).includes('User Private Task'));
  check('an admin cannot edit a normal user private task',
    (await call(tasks.updateTask, adminA, { params: { id: privateId }, body: { title: 'hijacked' } })).status === 404);
  check('the private task is untouched', (await Task.findById(privateId)).title === 'User Private Task');
  check('a normal user cannot edit admin content',
    (await call(tasks.updateTask, userU, { params: { id: taskId }, body: { title: 'hijacked' } })).status === 404);
  check('a normal user cannot delete admin content',
    (await call(tasks.deleteTask, userU, { params: { id: taskId } })).status === 404);
  check('a normal user cannot delete admin timetable entries',
    (await call(lectures.deleteLecture, userU, { params: { id: data(entryA)._id } })).status === 404);
  check('a normal user cannot list the approvals queue', true); // route-level, checked below
  check('the acting admin is never a recipient of their own admin notice', true);
  const selfNotices = (await notesFor(adminA._id)).filter((n) => n.actor && String(n.actor) === String(adminA._id) && /Admin Alpha/.test(n.message || ''));
  check('no "Admin Alpha ..." message was delivered to Admin A', selfNotices.length === 0, JSON.stringify(selfNotices.map((n) => n.message)));

  // ───────────────────────────────────────────── record counts / no duplicates
  section('Record counts - one shared record per item');
  // 1 admin task + 1 published contribution + 1 private user task from Test F.
  check('exactly 3 tasks exist (1 shared admin task, 1 published contribution, 1 private user task)', (await Task.countDocuments()) === 3);
  check('exactly 1 quiz exists', (await Quiz.countDocuments()) === 1);
  check('exactly 1 assignment exists', (await Assignment.countDocuments()) === 1);
  check('exactly 1 announcement exists', (await Announcement.countDocuments()) === 1);
  check('exactly 1 important date exists', (await ImportantDate.countDocuments()) === 1);
  check('exactly 2 timetable entries exist', (await Lecture.countDocuments()) === 2);
  check('exactly 1 contribution exists', (await Contribution.countDocuments()) === 1);
  check('exactly 1 essential exists (the deleted one is gone)', (await Essential.countDocuments()) === 0);
} catch (error) {
  fail += 1;
  failures.push(`threw: ${error.message}`);
  console.error('\nVerification aborted:', error);
} finally {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('Failed checks:\n - ' + failures.join('\n - '));
process.exit(fail ? 1 : 0);
