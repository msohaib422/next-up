/**
 * HTTP-level verification of the shared multi-admin model.
 *
 * verify-admin-sync.mjs calls the controllers directly. This suite goes through
 * the real Express app, the real `protect` / `authorize` middleware and a real
 * login, using TWO real admin accounts and one real user account, so the whole
 * request path is exercised: token -> role check -> query -> response.
 *
 * It also proves the two-admin premise itself: that both admins exist, are
 * collaborators, and are different accounts - the shared behaviour must not
 * depend on there being exactly one admin.
 *
 * As with verify-admin-sync.mjs, only records tagged `@sync.test` are created
 * and they are all removed again at the end.
 *
 * NOT part of the app. Run from backend/:  node scripts/verify-admin-sync-http.mjs
 */
import http from 'node:http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const { default: app } = await import('../server.js');
const { default: connectDB } = await import('../config/db.js');
const { acquireRunLock, removeAllTestData, testEmail, TEST_EMAIL } = await import('./verify-admin-sync-harness.mjs');
const User = (await import('../models/User.js')).default;
const Task = (await import('../models/Task.js')).default;
const Quiz = (await import('../models/Quiz.js')).default;
const Assignment = (await import('../models/Assignment.js')).default;
const Announcement = (await import('../models/Announcement.js')).default;
const Essential = (await import('../models/Essential.js')).default;
const Lecture = (await import('../models/Lecture.js')).default;
const ImportantDate = (await import('../models/ImportantDate.js')).default;
const Activity = (await import('../models/Activity.js')).default;
const Notification = (await import('../models/Notification.js')).default;
const Contribution = (await import('../models/Contribution.js')).default;

const PASSWORD = 'verify-sync-pass-123';

await connectDB();
const releaseLock = await acquireRunLock('verify-admin-sync-http.mjs');
await removeAllTestData();

const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;

const request = async (method, route, { token, body } = {}) => {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await response.json(); } catch { /* empty body */ }
  return { status: response.status, body: json };
};

let pass = 0;
let fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${extra ? `  <- ${extra}` : ''}`); }
};
const section = (t) => console.log(`\n=== ${t} ===`);
const ids = (res) => (res.body?.data || []).map((d) => String(d._id));

const runId = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const mkAccount = async (name, role) => {
  const user = await User.create({ name, email: testEmail(name, runId), password: PASSWORD, role, status: 'Approved' });
  const login = await request('POST', '/auth/login', { body: { email: user.email, password: PASSWORD } });
  if (login.status !== 200) throw new Error(`login failed for ${name}: ${JSON.stringify(login.body)}`);
  return { ...user.toObject(), token: login.body.token };
};

try {
  const adminA = await mkAccount('Alpha Admin', 'collaborator');
  const adminB = await mkAccount('Beta Admin', 'collaborator');
  const userU = await mkAccount('Regular User', 'user');

  section('Preconditions - there really are two different admins');
  check('Admin A is a collaborator', adminA.role === 'collaborator');
  check('Admin B is a collaborator', adminB.role === 'collaborator');
  check('Admin A and Admin B are different accounts', String(adminA._id) !== String(adminB._id));
  check('both admin tokens authenticate', (await request('GET', '/tasks', { token: adminA.token })).status === 200
    && (await request('GET', '/tasks', { token: adminB.token })).status === 200);
  check('the user token is not an admin token', (await request('GET', '/users/admin/users', { token: userU.token })).status === 403);

  section('Test A - Task: Admin A creates, both admins and the user see it');
  const taskRes = await request('POST', '/tasks', {
    token: adminA.token,
    body: { subject: 'Database Systems', title: 'HTTP Shared Task', deadlineMode: 'Date', deadline: '2030-01-01', priority: 'High' },
  });
  check('POST /tasks succeeds', taskRes.status === 201, JSON.stringify(taskRes.body));
  const taskId = String(taskRes.body.data._id);
  check('GET /tasks as Admin A contains it', ids(await request('GET', '/tasks', { token: adminA.token })).includes(taskId));
  check('GET /tasks as Admin B contains it', ids(await request('GET', '/tasks', { token: adminB.token })).includes(taskId));
  check('GET /tasks as the user contains it', ids(await request('GET', '/tasks', { token: userU.token })).includes(taskId));
  check('GET /tasks/:id works for Admin B', (await request('GET', `/tasks/${taskId}`, { token: adminB.token })).status === 200);
  const adminBNotifications = await Notification.find({ recipient: adminB._id, entityId: taskId });
  check('Admin B has the admin notification', adminBNotifications.length === 1 && /Alpha Admin/.test(adminBNotifications[0].message), adminBNotifications[0]?.message);
  check('Admin A has no notification about their own action', (await Notification.countDocuments({ recipient: adminA._id, entityId: taskId })) === 0);
  check('the user has the existing user notification', (await Notification.countDocuments({ recipient: userU._id, entityId: taskId, type: 'CONTENT_ADDED' })) === 1);

  const editRes = await request('PUT', `/tasks/${taskId}`, { token: adminB.token, body: { title: 'HTTP Shared Task (edited by B)' } });
  check('Admin B can PUT Admin A task', editRes.status === 200 && editRes.body.data.title === 'HTTP Shared Task (edited by B)', JSON.stringify(editRes.body).slice(0, 140));
  check('still one task record', (await Task.countDocuments({ _id: taskId })) === 1);
  check('Admin A sees the edit', (await request('GET', `/tasks/${taskId}`, { token: adminA.token })).body.data.title === 'HTTP Shared Task (edited by B)');
  check('the user sees the edit', (await request('GET', `/tasks/${taskId}`, { token: userU.token })).body.data.title === 'HTTP Shared Task (edited by B)');
  check('Admin A is told about the edit', (await Notification.countDocuments({ recipient: adminA._id, entityId: taskId, type: 'CONTENT_UPDATED' })) === 1);
  check('the user cannot PUT an admin task', (await request('PUT', `/tasks/${taskId}`, { token: userU.token, body: { title: 'nope' } })).status === 404);
  check('the user cannot DELETE an admin task', (await request('DELETE', `/tasks/${taskId}`, { token: userU.token })).status === 404);

  section('Test B - Quiz: created by Admin A, seen and announced to Admin B');
  const quizRes = await request('POST', '/quizzes', {
    token: adminA.token,
    body: { subject: 'Artificial Intelligence', title: 'HTTP Shared Quiz', date: '2030-02-02', deadlineMode: 'Date', priority: 'Medium' },
  });
  const quizId = String(quizRes.body.data._id);
  check('Admin B sees the quiz', ids(await request('GET', '/quizzes', { token: adminB.token })).includes(quizId));
  check('the user sees the quiz', ids(await request('GET', '/quizzes', { token: userU.token })).includes(quizId));
  const quizNotif = await Notification.findOne({ recipient: adminB._id, entityId: quizId });
  check('Admin B notified, naming Admin A and the type', /Alpha Admin/.test(quizNotif?.message || '') && /quiz/.test(quizNotif?.message || ''), quizNotif?.message);

  section('Test C - Contribution approved by Admin A, published once, visible to Admin B');
  const contrib = await request('POST', '/contributions', {
    token: userU.token,
    body: { type: 'Task', title: 'HTTP Contributed Task', content: { title: 'HTTP Contributed Task', subject: 'Database Systems', deadlineMode: 'Date', date: '2030-03-03', priority: 'Low' } },
  });
  check('user submits a contribution', contrib.status === 201, JSON.stringify(contrib.body));
  const contribId = String(contrib.body.data._id);
  const approved = await request('POST', `/admin/contributions/${contribId}/approve`, { token: adminA.token });
  check('Admin A approves it', approved.status === 200, JSON.stringify(approved.body).slice(0, 140));
  const publishedId = String(approved.body.data.finalEntity);
  check('Admin A sees the published task', ids(await request('GET', '/tasks', { token: adminA.token })).includes(publishedId));
  check('Admin B sees the published task', ids(await request('GET', '/tasks', { token: adminB.token })).includes(publishedId));
  check('the user sees the published task', ids(await request('GET', '/tasks', { token: userU.token })).includes(publishedId));
  check('one published record only', (await Task.countDocuments({ user: { $in: [adminA._id, adminB._id] }, title: 'HTTP Contributed Task' })) === 1);
  check('Admin B is told who published it', (await Notification.countDocuments({ recipient: adminB._id, entityId: publishedId, type: 'CONTRIBUTION_PUBLISHED' })) === 1);
  check('the contributor is told it is published', (await Notification.countDocuments({ recipient: userU._id, entityId: publishedId, type: 'CONTRIBUTION_PUBLISHED' })) === 1);
  check('Admin B sees it in the admin contribution list', ids(await request('GET', '/admin/contributions', { token: adminB.token })).includes(contribId));
  check('the user still cannot approve contributions', (await request('POST', `/admin/contributions/${contribId}/approve`, { token: userU.token })).status === 403);
  check('the user still sees it in their own contribution list', ids(await request('GET', '/contributions', { token: userU.token })).includes(contribId));

  section('Test D - Timetable shared between both admins');
  const lectureA = await request('POST', '/lectures', { token: adminA.token, body: { subject: 'Monday 10:00 AM', timeline: 'Weekly', notes: 'Database Systems' } });
  const lectureB = await request('POST', '/lectures', { token: adminB.token, body: { subject: 'Tuesday 12:00 PM', timeline: 'Weekly', notes: 'Artificial Intelligence' } });
  const lecAId = String(lectureA.body.data._id);
  const lecBId = String(lectureB.body.data._id);
  const lecIds = async (token) => ids(await request('GET', '/lectures', { token }));
  check('Admin A sees entry A and entry B', (await lecIds(adminA.token)).includes(lecAId) && (await lecIds(adminA.token)).includes(lecBId));
  check('Admin B sees entry A and entry B', (await lecIds(adminB.token)).includes(lecAId) && (await lecIds(adminB.token)).includes(lecBId));
  check('the user sees entry A and entry B', (await lecIds(userU.token)).includes(lecAId) && (await lecIds(userU.token)).includes(lecBId));
  const authored = (Model) => ({ user: { $in: [adminA._id, adminB._id, userU._id] } });
  check('two timetable records, not four', (await Lecture.countDocuments(authored(Lecture))) === 2, `${await Lecture.countDocuments(authored(Lecture))}`);
  check('Admin B notified of Admin A timetable entry', /Alpha Admin/.test((await Notification.findOne({ recipient: adminB._id, entityId: lecAId }))?.message || ''));
  const lecEdit = await request('PUT', `/lectures/${lecBId}`, { token: adminA.token, body: { subject: 'Tuesday 12:00 PM', timeline: 'Weekly', notes: 'Artificial Intelligence (edited by A)' } });
  check('Admin A edits Admin B entry', lecEdit.status === 200, JSON.stringify(lecEdit.body).slice(0, 140));
  check('Admin B sees the updated entry', (await request('GET', `/lectures/${lecBId}`, { token: adminB.token })).body.data.notes === 'Artificial Intelligence (edited by A)');
  check('the user sees the updated entry', (await request('GET', `/lectures/${lecBId}`, { token: userU.token })).body.data.notes === 'Artificial Intelligence (edited by A)');
  check('still one record for that entry', (await Lecture.countDocuments({ _id: lecBId })) === 1);
  check('Admin B notified of the timetable edit', (await Notification.countDocuments({ recipient: adminB._id, entityId: lecBId, type: 'CONTENT_UPDATED' })) === 1);
  check('the user cannot edit an admin timetable entry', (await request('PUT', `/lectures/${lecAId}`, { token: userU.token, body: { subject: 'nope' } })).status === 404);

  section('Test E - Assignment, announcement, essential, important date across admins');
  const assignment = await request('POST', '/assignments', { token: adminB.token, body: { subject: 'Operating Systems', title: 'HTTP Shared Assignment', deadlineMode: 'Date', deadline: '2030-07-07', priority: 'High' } });
  const assignmentId = String(assignment.body.data._id);
  check('Admin A sees Admin B assignment', ids(await request('GET', '/assignments', { token: adminA.token })).includes(assignmentId));
  check('the user sees Admin B assignment', ids(await request('GET', '/assignments', { token: userU.token })).includes(assignmentId));
  check('Admin A notified of the assignment', (await Notification.countDocuments({ recipient: adminA._id, entityId: assignmentId })) === 1);

  const announcement = await request('POST', '/announcements', { token: adminB.token, body: { title: 'HTTP Shared Announcement', type: 'General', date: '2030-08-08' } });
  const announcementId = String(announcement.body.data._id);
  check('Admin A sees Admin B announcement', ids(await request('GET', '/announcements', { token: adminA.token })).includes(announcementId));
  check('the user sees Admin B announcement', ids(await request('GET', '/announcements', { token: userU.token })).includes(announcementId));
  check('Admin A notified of the announcement', /announcement/.test((await Notification.findOne({ recipient: adminA._id, entityId: announcementId }))?.message || ''));
  const pinRes = await request('PUT', `/announcements/${announcementId}/pin`, { token: adminA.token });
  check('Admin A can pin Admin B announcement', pinRes.status === 200 && pinRes.body.data.pinned === true, JSON.stringify(pinRes.body).slice(0, 140));
  check('pin is visible to Admin B and the user', (await request('GET', `/announcements/${announcementId}`, { token: adminB.token })).body.data.pinned === true
    && (await request('GET', `/announcements/${announcementId}`, { token: userU.token })).body.data.pinned === true);
  check('Admin B is told about the pin', (await Notification.countDocuments({ recipient: adminB._id, entityId: announcementId, type: 'CONTENT_PINNED' })) === 1);

  const essential = await request('POST', '/essentials', { token: adminB.token, body: { course: 'DB', title: 'HTTP Shared Essential', tag: 'Topic' } });
  const essentialId = String(essential.body.data._id);
  check('Admin A sees Admin B essential', ids(await request('GET', '/essentials', { token: adminA.token })).includes(essentialId));
  check('the user sees Admin B essential', ids(await request('GET', '/essentials', { token: userU.token })).includes(essentialId));

  const importantDate = await request('POST', '/important-dates', { token: adminB.token, body: { title: 'HTTP Midterms', date: '2030-09-09', type: 'Exam', priority: 'High' } });
  const importantDateId = String(importantDate.body.data._id);
  check('Admin A sees Admin B important date', ids(await request('GET', '/important-dates', { token: adminA.token })).includes(importantDateId));
  check('the user sees Admin B important date', ids(await request('GET', '/important-dates', { token: userU.token })).includes(importantDateId));

  const searchAsB = await request('GET', '/search?q=HTTP', { token: adminB.token });
  check('global search as Admin B finds Admin A task', (searchAsB.body?.data?.tasks || []).some((t) => String(t._id) === taskId));
  const searchAsUser = await request('GET', '/search?q=HTTP', { token: userU.token });
  check('global search as the user finds Admin A task', (searchAsUser.body?.data?.tasks || []).some((t) => String(t._id) === taskId));

  section('Test F - Admin dashboard data source is the shared one');
  // The admin dashboard must report on the workspace, not only on its own rows.
  const sharedForA = ids(await request('GET', '/assignments', { token: adminA.token }));
  const ownForA = ids(await request('GET', '/assignments/my', { token: adminA.token }));
  check('Admin A has no assignments of their own here', !ownForA.includes(assignmentId));
  check('the shared endpoint still shows Admin B assignment to Admin A', sharedForA.includes(assignmentId));
} finally {
  const report = await removeAllTestData();
  console.log(`\ncleanup: removed ${report.accounts} test account(s), ${report.content} record(s), ${report.notifications} notification(s), ${report.activities} activity row(s)`);
  const leftovers = await User.countDocuments({ email: TEST_EMAIL });
  console.log(`leftover test accounts: ${leftovers}`);
  server.close();
  await releaseLock();
  await mongoose.disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
