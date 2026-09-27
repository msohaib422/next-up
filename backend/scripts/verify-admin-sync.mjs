/**
 * End-to-end verification of the SHARED MULTI-ADMIN model (controller level).
 *
 * Runs the real controllers against the real database with two real admin
 * accounts and two real user accounts, so every claim in the brief is observed
 * for real rather than reasoned about:
 *
 *   Test A  Admin A creates a task      -> visible to A, B and users; B notified; A not
 *   Test B  Admin A creates a quiz      -> same
 *   Test C  User contribution approved  -> published ONCE, visible to A, B and users
 *   Test D  Timetable entries from both -> each admin sees both; an edit is one record
 *   Test E  Assignments/announcements/essentials/dates across admins
 *   Test F  Permissions unchanged       -> a user still cannot touch admin content,
 *                                          another user's content, or read it
 *   Test G  No duplication              -> one record per action, shared by reference
 *
 * Writes into the real database and removes everything it creates; see
 * verify-admin-sync-harness.mjs for how that is made safe, and for the run lock
 * that stops two suites interleaving.
 *
 * NOT part of the app. Run from backend/:  node scripts/verify-admin-sync.mjs
 * or:                              npm run verify:admin-sync
 */
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const connect = (await import('../config/db.js')).default;
const { acquireRunLock, removeAllTestData, testEmail, CONTENT_MODELS, TEST_EMAIL } = await import('./verify-admin-sync-harness.mjs');

const tasks = await import('../controllers/taskController.js');
const quizzes = await import('../controllers/quizController.js');
const assignments = await import('../controllers/assignmentController.js');
const announcements = await import('../controllers/announcementController.js');
const essentials = await import('../controllers/essentialController.js');
const lectures = await import('../controllers/lectureController.js');
const dates = await import('../controllers/importantDateController.js');
const contributions = await import('../controllers/contributionController.js');
const User = (await import('../models/User.js')).default;
const Task = (await import('../models/Task.js')).default;
const Quiz = (await import('../models/Quiz.js')).default;
const Assignment = (await import('../models/Assignment.js')).default;
const Announcement = (await import('../models/Announcement.js')).default;
const Essential = (await import('../models/Essential.js')).default;
const Contribution = (await import('../models/Contribution.js')).default;
const Lecture = (await import('../models/Lecture.js')).default;
const Notification = (await import('../models/Notification.js')).default;

await connect();
const releaseLock = await acquireRunLock('verify-admin-sync.mjs');
const cleared = await removeAllTestData();

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);

const mkRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};
const call = async (fn, { body = {}, params = {}, query = {}, user }) => {
  const res = mkRes();
  await fn({ body, params, query, user }, res, (e) => { throw e; });
  return res;
};

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const mkUser = (name, role) => User.create({ name, email: testEmail(name, runId), password: 'secret123', role, status: 'Approved' });

const adminA = await mkUser('Alpha Admin', 'collaborator');
const adminB = await mkUser('Beta Admin', 'collaborator');
const userU = await mkUser('Regular User', 'user');
const userV = await mkUser('Other User', 'user');
// Scope for the "no duplication" checks: content authored by THIS run only, so
// unrelated data in the database can never make them pass or fail.
const authored = (Model) => ({ user: { $in: [adminA._id, adminB._id, userU._id] } });

const ids = (res) => (res.body?.data || []).map((d) => String(d._id));
const notifsFor = (userId, entityId) => Notification.find({ recipient: userId, entityId }).sort({ createdAt: -1 });

if (cleared.accounts) console.log(`(cleared ${cleared.accounts} leftover test account(s) and ${cleared.content} record(s) from an earlier run)`);

try {
  // -------------------------------------------------------------------------
  section('Test A - Task created by Admin A');
  const created = await call(tasks.createTask, {
    user: adminA,
    body: { subject: 'Database Systems', title: 'Shared Task A', description: 'x', deadlineMode: 'Date', deadline: '2030-01-01', priority: 'High', status: 'Pending' },
  });
  check('Admin A create returns 201', created.statusCode === 201, JSON.stringify(created.body));
  const taskId = String(created.body.data._id);

  check('Admin A sees the task', ids(await call(tasks.getTasks, { user: adminA })).includes(taskId));
  check('Admin B sees the task', ids(await call(tasks.getTasks, { user: adminB })).includes(taskId));
  check('user sees the task', ids(await call(tasks.getTasks, { user: userU })).includes(taskId));

  const bTaskNotifs = await notifsFor(adminB._id, taskId);
  check('Admin B notified of the new task', bTaskNotifs.length === 1, `got ${bTaskNotifs.length}`);
  check('Admin B notification names the acting admin', /Alpha Admin/.test(bTaskNotifs[0]?.message || ''), bTaskNotifs[0]?.message);
  check('Admin B notification links to the task', (bTaskNotifs[0]?.link || '').includes(taskId));
  check('Admin A got no self-notification', (await notifsFor(adminA._id, taskId)).length === 0);
  const uTaskNotifs = await notifsFor(userU._id, taskId);
  check('user still notified (existing wording kept)', uTaskNotifs.length === 1 && uTaskNotifs[0].type === 'CONTENT_ADDED', uTaskNotifs[0]?.message);
  check('user notification wording unchanged', uTaskNotifs[0]?.message === '"Shared Task A" has been added.', uTaskNotifs[0]?.message);

  // Admin B edits the shared record.
  const edited = await call(tasks.updateTask, { user: adminB, params: { id: taskId }, body: { title: 'Shared Task A (edited by B)' } });
  check('Admin B can edit Admin A task', edited.statusCode === 200 && edited.body.data?.title === 'Shared Task A (edited by B)', JSON.stringify(edited.body).slice(0, 160));
  check('edit produced exactly one task record', (await Task.countDocuments({ _id: taskId })) === 1);
  check('Admin A sees the edit', (await call(tasks.getTask, { user: adminA, params: { id: taskId } })).body.data.title === 'Shared Task A (edited by B)');
  check('user sees the edit', (await call(tasks.getTask, { user: userU, params: { id: taskId } })).body.data.title === 'Shared Task A (edited by B)');
  const aEditNotifs = await notifsFor(adminA._id, taskId);
  check("Admin A notified about Admin B's edit", aEditNotifs.length === 1 && /Beta Admin/.test(aEditNotifs[0].message), aEditNotifs[0]?.message);
  check('Admin B not notified about their own edit', (await notifsFor(adminB._id, taskId)).filter((n) => n.type === 'CONTENT_UPDATED').length === 0);

  // -------------------------------------------------------------------------
  section('Test B - Quiz created by Admin A');
  const quizRes = await call(quizzes.createQuiz, {
    user: adminA,
    body: { subject: 'Artificial Intelligence', title: 'Shared Quiz A', date: '2030-02-02', deadlineMode: 'Date', priority: 'Medium' },
  });
  const quizId = String(quizRes.body.data._id);
  check('Admin B sees the quiz', ids(await call(quizzes.getQuizzes, { user: adminB })).includes(quizId));
  check('user sees the quiz', ids(await call(quizzes.getQuizzes, { user: userU })).includes(quizId));
  const bQuizNotifs = await notifsFor(adminB._id, quizId);
  check('Admin B notified of the new quiz', bQuizNotifs.length === 1 && /Alpha Admin/.test(bQuizNotifs[0].message), bQuizNotifs[0]?.message);
  check('quiz notification says "quiz"', /quiz/.test(bQuizNotifs[0]?.message || ''), bQuizNotifs[0]?.message);

  // -------------------------------------------------------------------------
  section('Test C - Contribution submitted by a user, approved by Admin A');
  const contrib = await call(contributions.createContribution, {
    user: userU,
    body: { type: 'Task', title: 'Contributed Task', content: { title: 'Contributed Task', subject: 'Database Systems', deadlineMode: 'Date', date: '2030-03-03', priority: 'Low' } },
  });
  const contribId = String(contrib.body.data._id);
  check('both admins told about the submission', (await notifsFor(adminA._id, contribId)).length === 1 && (await notifsFor(adminB._id, contribId)).length === 1);

  const approved = await call(contributions.approveContribution, { user: adminA, params: { id: contribId } });
  check('approval succeeds', approved.statusCode === 200, JSON.stringify(approved.body).slice(0, 160));
  const publishedId = String(approved.body.data.finalEntity);

  check('Admin A sees the published task', ids(await call(tasks.getTasks, { user: adminA })).includes(publishedId));
  check('Admin B sees the published task', ids(await call(tasks.getTasks, { user: adminB })).includes(publishedId));
  check('user sees the published task', ids(await call(tasks.getTasks, { user: userU })).includes(publishedId));
  check('exactly one published record (no duplicate copy)', (await Task.countDocuments({ ...authored(Task), title: 'Contributed Task' })) === 1);
  check('published record keeps contributor attribution', String((await Task.findById(publishedId)).contributor) === String(userU._id));

  const bPublishNotifs = await notifsFor(adminB._id, publishedId);
  check('Admin B notified that Admin A published it', bPublishNotifs.length === 1 && /Alpha Admin/.test(bPublishNotifs[0].message), bPublishNotifs[0]?.message);
  check('Admin A not notified of their own publication', (await notifsFor(adminA._id, publishedId)).length === 0);
  const uPublishNotifs = await notifsFor(userU._id, publishedId);
  check('contributor notified exactly once', uPublishNotifs.length === 1 && uPublishNotifs[0].type === 'CONTRIBUTION_PUBLISHED', `${uPublishNotifs.length} ${uPublishNotifs[0]?.type}`);
  check('contributor message unchanged', /has been approved and published/.test(uPublishNotifs[0]?.message || ''), uPublishNotifs[0]?.message);
  check('contribution is listed for every admin', ids(await call(contributions.listContributions, { user: adminB, query: {} })).includes(contribId));

  // A published contribution of each remaining type.
  for (const [type, content, listFn] of [
    ['Quiz', { title: 'Contributed Quiz', subject: 'AI', deadlineMode: 'Date', date: '2030-04-04', priority: 'High' }, (u) => call(quizzes.getQuizzes, { user: u })],
    ['Assignment', { title: 'Contributed Assignment', subject: 'OS', deadlineMode: 'Date', date: '2030-05-05', priority: 'High' }, (u) => call(assignments.getAssignments, { user: u })],
    ['Essential', { title: 'Contributed Essential', course: 'DB', tag: 'Topic' }, (u) => call(essentials.getEssentials, { user: u })],
    ['Announcement', { title: 'Contributed Announcement', type: 'General', date: '2030-06-06' }, (u) => call(announcements.getAnnouncements, { user: u })],
  ]) {
    const c = await call(contributions.createContribution, { user: userU, body: { type, title: content.title, content } });
    const a = await call(contributions.approveContribution, { user: adminB, params: { id: String(c.body.data._id) } });
    const entityId = String(a.body.data.finalEntity);
    check(`${type}: published by Admin B is visible to Admin A`, ids(await listFn(adminA)).includes(entityId));
    check(`${type}: published by Admin B is visible to the user`, ids(await listFn(userU)).includes(entityId));
    check(`${type}: Admin A notified of the publication`, (await notifsFor(adminA._id, entityId)).length === 1);
  }

  // -------------------------------------------------------------------------
  section('Test D - Shared timetable');
  const lecA = await call(lectures.createLecture, { user: adminA, body: { subject: 'Monday 10:00 AM', timeline: 'Weekly', notes: 'Database Systems' } });
  const lecB = await call(lectures.createLecture, { user: adminB, body: { subject: 'Tuesday 12:00 PM', timeline: 'Weekly', notes: 'Artificial Intelligence' } });
  const lecAId = String(lecA.body.data._id);
  const lecBId = String(lecB.body.data._id);
  const lecFor = async (u) => ids(await call(lectures.getLectures, { user: u }));
  check('Admin A sees both timetable entries', (await lecFor(adminA)).includes(lecAId) && (await lecFor(adminA)).includes(lecBId));
  check('Admin B sees both timetable entries', (await lecFor(adminB)).includes(lecAId) && (await lecFor(adminB)).includes(lecBId));
  check('user sees both timetable entries', (await lecFor(userU)).includes(lecAId) && (await lecFor(userU)).includes(lecBId));
  check('no duplicate lecture records', (await Lecture.countDocuments(authored(Lecture))) === 2, `${await Lecture.countDocuments(authored(Lecture))}`);
  const lecNotif = (await notifsFor(adminB._id, lecAId))[0];
  check('Admin B notified about the timetable entry', /Alpha Admin/.test(lecNotif?.message || '') && /timetable entry/.test(lecNotif?.message || ''), lecNotif?.message);

  await call(lectures.updateLecture, { user: adminA, params: { id: lecBId }, body: { subject: 'Tuesday 12:00 PM', timeline: 'Weekly', notes: 'Artificial Intelligence (edited by A)' } });
  check('edit updated the single existing record', (await Lecture.countDocuments({ _id: lecBId })) === 1);
  const bSeesEdit = (await call(lectures.getLecture, { user: adminB, params: { id: lecBId } })).body.data;
  check("Admin B sees Admin A's timetable edit", bSeesEdit.notes === 'Artificial Intelligence (edited by A)', bSeesEdit.notes);
  check("user sees Admin A's timetable edit", (await call(lectures.getLecture, { user: userU, params: { id: lecBId } })).body.data.notes === 'Artificial Intelligence (edited by A)');
  check('Admin B notified about the timetable edit', (await notifsFor(adminB._id, lecBId)).some((n) => n.type === 'CONTENT_UPDATED' && /Alpha Admin/.test(n.message)));

  // -------------------------------------------------------------------------
  section('Test E - Assignments, announcements, essentials, important dates');
  const asg = await call(assignments.createAssignment, { user: adminB, body: { subject: 'Operating Systems', title: 'Shared Assignment B', deadlineMode: 'Date', deadline: '2030-07-07', priority: 'High' } });
  const asgId = String(asg.body.data._id);
  check('Admin A sees Admin B assignment', ids(await call(assignments.getAssignments, { user: adminA })).includes(asgId));
  check('user sees Admin B assignment', ids(await call(assignments.getAssignments, { user: userU })).includes(asgId));
  check('Admin A notified of the assignment', (await notifsFor(adminA._id, asgId)).length === 1);

  const ann = await call(announcements.createAnnouncement, { user: adminB, body: { title: 'Shared Announcement B', type: 'General', date: '2030-08-08' } });
  const annId = String(ann.body.data._id);
  check('Admin A sees Admin B announcement', ids(await call(announcements.getAnnouncements, { user: adminA })).includes(annId));
  check('user sees Admin B announcement', ids(await call(announcements.getAnnouncements, { user: userU })).includes(annId));
  check('Admin A notified of the announcement', /announcement/.test((await notifsFor(adminA._id, annId))[0]?.message || ''));

  const ess = await call(essentials.createEssential, { user: adminB, body: { course: 'DB', title: 'Shared Essential B', tag: 'Topic' } });
  const essId = String(ess.body.data._id);
  check('Admin A sees Admin B essential', ids(await call(essentials.getEssentials, { user: adminA })).includes(essId));
  check('user sees Admin B essential', ids(await call(essentials.getEssentials, { user: userU })).includes(essId));

  const impDate = await call(dates.createImportantDate, { user: adminB, body: { title: 'Midterms', date: '2030-09-09', type: 'Exam', priority: 'High' } });
  const impId = String(impDate.body.data._id);
  check('Admin A sees Admin B important date', ids(await call(dates.getImportantDates, { user: adminA })).includes(impId));
  check('user sees Admin B important date', ids(await call(dates.getImportantDates, { user: userU })).includes(impId));

  // An admin can also delete shared content created by another admin: it is one
  // record in one workspace, not a row per admin.
  await call(announcements.deleteAnnouncement, { user: adminA, params: { id: annId } });
  check('Admin A deleted Admin B announcement (shared record)', (await Announcement.countDocuments({ _id: annId })) === 0);
  check('deleted announcement is gone for the user too', !ids(await call(announcements.getAnnouncements, { user: userU })).includes(annId));

  // -------------------------------------------------------------------------
  section('Test F - Permissions and privacy are unchanged');
  const userTask = await call(tasks.createTask, { user: userU, body: { subject: 'Personal', title: 'User Private Task', deadlineMode: 'As Possible', priority: 'Low' } });
  const userTaskId = String(userTask.body.data._id);
  check('other user cannot read a private user task', !ids(await call(tasks.getTasks, { user: userV })).includes(userTaskId));
  check('other user cannot open it directly', (await call(tasks.getTask, { user: userV, params: { id: userTaskId } })).statusCode === 404);
  check('other user cannot edit it', (await call(tasks.updateTask, { user: userV, params: { id: userTaskId }, body: { title: 'hijacked' } })).statusCode === 404);
  check('other user cannot delete it', (await call(tasks.deleteTask, { user: userV, params: { id: userTaskId } })).statusCode === 404);
  check('its owner still can', (await call(tasks.updateTask, { user: userU, params: { id: userTaskId }, body: { title: 'User Private Task v2' } })).statusCode === 200);
  check("a user cannot read another user's contributions", !ids(await call(contributions.getMyContributions, { user: userV, query: {} })).includes(contribId));

  check('user cannot edit an admin task', (await call(tasks.updateTask, { user: userU, params: { id: taskId }, body: { title: 'hijacked' } })).statusCode === 404);
  check('user cannot delete an admin task', (await call(tasks.deleteTask, { user: userU, params: { id: taskId } })).statusCode === 404);
  check('user cannot edit an admin timetable entry', (await call(lectures.updateLecture, { user: userU, params: { id: lecAId }, body: { subject: 'hijacked' } })).statusCode === 404);
  check('user cannot delete an admin assignment', (await call(assignments.deleteAssignment, { user: userU, params: { id: asgId } })).statusCode === 404);
  check('user creates no admin notification', (await notifsFor(adminA._id, userTaskId)).length === 0 && (await notifsFor(userV._id, userTaskId)).length === 0);
  check('shared admin task still intact after the blocked attempts', String((await Task.findById(taskId)).title) === 'Shared Task A (edited by B)');

  // -------------------------------------------------------------------------
  section('Test G - One record, many readers (no duplication)');
  check('exactly one task titled "Shared Task A (edited by B)"', (await Task.countDocuments({ ...authored(Task), title: 'Shared Task A (edited by B)' })) === 1);
  check('exactly one quiz from Admin A', (await Quiz.countDocuments({ ...authored(Quiz), title: 'Shared Quiz A' })) === 1);
  check('exactly one assignment from Admin B', (await Assignment.countDocuments({ ...authored(Assignment), title: 'Shared Assignment B' })) === 1);
  check('exactly one essential from Admin B', (await Essential.countDocuments({ ...authored(Essential), title: 'Shared Essential B' })) === 1);
  check('both admins read the same task document', String((await call(tasks.getTask, { user: adminA, params: { id: taskId } })).body.data._id) === String((await call(tasks.getTask, { user: adminB, params: { id: taskId } })).body.data._id));
  check('contribution record still points at the single published entity', String((await Contribution.findById(contribId)).finalEntity) === publishedId);

  // A second approval attempt must not publish a second copy.
  const second = await call(contributions.approveContribution, { user: adminB, params: { id: contribId } });
  check('re-approving is refused', second.statusCode === 409, JSON.stringify(second.body));
  check('still only one published record', (await Task.countDocuments({ ...authored(Task), title: 'Contributed Task' })) === 1);

  // Every notification this run created must be individually addressable.
  const duplicates = await Notification.aggregate([
    { $match: { recipient: { $in: [adminA._id, adminB._id, userU._id] } } },
    { $group: { _id: '$dedupeKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  check('no duplicate notification for any recipient', duplicates.length === 0, JSON.stringify(duplicates));
} finally {
  const report = await removeAllTestData();
  console.log(`\ncleanup: removed ${report.accounts} test account(s), ${report.content} record(s), ${report.notifications} notification(s), ${report.activities} activity row(s)`);
  const leftovers = await User.find({ email: TEST_EMAIL }).select("_id");
  console.log(`leftover test accounts: ${leftovers.length}`);
  await releaseLock();
  await mongoose.disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
