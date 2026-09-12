import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from './models/User.js';
import Task from './models/Task.js';
import Quiz from './models/Quiz.js';
import Reminder from './models/Reminder.js';
import Event from './models/Event.js';
import Announcement from './models/Announcement.js';
import Lecture from './models/Lecture.js';
import ImportantDate from './models/ImportantDate.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const seed = async () => {
  await connectDB();

  try {
    console.log('Seeding users...');

    let collaborator1 = await User.findOne({ email: 'msohaib.ai.dev@gmail.com' });
    if (!collaborator1) {
      collaborator1 = await User.create({
        name: 'Sohaib',
        email: 'msohaib.ai.dev@gmail.com',
        password: '12345678',
        role: 'collaborator',
      });
      console.log('Created collaborator 1: Sohaib');
    } else {
      console.log('Collaborator 1 already exists: Sohaib');
    }

    let collaborator2 = await User.findOne({ email: 'collaborator2@university.edu' });
    if (!collaborator2) {
      collaborator2 = await User.create({
        name: 'Collaborator2',
        email: 'collaborator2@university.edu',
        password: '12345678',
        role: 'collaborator',
      });
      console.log('Created collaborator 2: Collaborator2');
    } else {
      console.log('Collaborator 2 already exists: Collaborator2');
    }

    let demoUser = await User.findOne({ email: 'demo@university.edu' });
    if (!demoUser) {
      demoUser = await User.create({
        name: 'Demo User',
        email: 'demo@university.edu',
        password: '12345678',
        role: 'user',
      });
      console.log('Created demo user: Demo User');
    } else {
      console.log('Demo user already exists: Demo User');
    }

    console.log('Clearing demo data...');
    await Task.deleteMany({ user: demoUser._id });
    await Quiz.deleteMany({ user: demoUser._id });
    await Reminder.deleteMany({ user: demoUser._id });
    await Event.deleteMany({ user: demoUser._id });
    await Announcement.deleteMany({ user: demoUser._id });
    await Lecture.deleteMany({ user: demoUser._id });
    await ImportantDate.deleteMany({ user: demoUser._id });

    console.log('Seeding tasks...');
    const tasks = await Task.insertMany([
      {
        user: demoUser._id,
        subject: 'Mathematics',
        title: 'Calculus Assignment 3',
        description: 'Complete exercises 5.1 to 5.8 from the textbook',
        deadline: new Date('2026-09-20'),
        priority: 'High',
        status: 'Pending',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        title: 'Lab Report - Wave Motion',
        description: 'Write up the lab report for the wave motion experiment',
        deadline: new Date('2026-09-22'),
        priority: 'Medium',
        status: 'In Progress',
      },
      {
        user: demoUser._id,
        subject: 'Computer Science',
        title: 'Build REST API',
        description: 'Create a REST API with Express.js and MongoDB',
        deadline: new Date('2026-09-25'),
        priority: 'High',
        status: 'Pending',
      },
      {
        user: demoUser._id,
        subject: 'English',
        title: 'Essay Draft',
        description: 'Write a 2000 word essay on modern literature',
        deadline: new Date('2026-09-28'),
        priority: 'Low',
        status: 'Pending',
      },
    ]);
    console.log(`Created ${tasks.length} tasks`);

    console.log('Seeding quizzes...');
    const quizzes = await Quiz.insertMany([
      {
        user: demoUser._id,
        subject: 'Mathematics',
        title: 'Calculus Quiz 2',
        description: 'Covers derivatives and integrals',
        date: new Date('2026-09-18'),
        time: '10:00',
        priority: 'High',
        status: 'Upcoming',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        title: 'Optics Midterm',
        description: 'Covers chapters 1-5 on optics',
        date: new Date('2026-09-23'),
        time: '14:00',
        priority: 'High',
        status: 'Upcoming',
      },
      {
        user: demoUser._id,
        subject: 'Chemistry',
        title: 'Organic Chemistry Pop Quiz',
        description: 'Surprise quiz on functional groups',
        date: new Date('2026-09-15'),
        time: '09:00',
        priority: 'Medium',
        status: 'Completed',
        isSurprise: true,
      },
    ]);
    console.log(`Created ${quizzes.length} quizzes`);

    console.log('Seeding reminders...');
    const reminders = await Reminder.insertMany([
      {
        user: demoUser._id,
        subject: 'General',
        title: 'Submit Library Books',
        description: 'Return 3 overdue library books',
        date: new Date('2026-09-16'),
        time: '17:00',
        type: 'General',
        priority: 'Medium',
        status: 'Pending',
      },
      {
        user: demoUser._id,
        subject: 'Computer Science',
        title: 'Project Submission',
        description: 'Submit the final year project proposal',
        date: new Date('2026-09-25'),
        time: '23:59',
        type: 'Submission',
        priority: 'High',
        status: 'Pending',
      },
      {
        user: demoUser._id,
        subject: 'Mathematics',
        title: 'Assignment 4 Preparation',
        description: 'Start working on Calculus Assignment 4',
        date: new Date('2026-09-20'),
        time: '09:00',
        type: 'Assignment',
        priority: 'Low',
        status: 'Pending',
      },
    ]);
    console.log(`Created ${reminders.length} reminders`);

    console.log('Seeding events...');
    const events = await Event.insertMany([
      {
        user: demoUser._id,
        title: 'University Open Day',
        date: new Date('2026-09-19'),
        time: '10:00',
        location: 'Main Auditorium',
        description: 'Annual university open day for prospective students',
        type: 'University',
      },
      {
        user: demoUser._id,
        title: 'CS Department Seminar',
        date: new Date('2026-09-21'),
        time: '14:00',
        location: 'Room 301, CS Building',
        description: 'Guest lecture on AI in Healthcare',
        type: 'Department',
      },
      {
        user: demoUser._id,
        title: 'Study Group Meeting',
        date: new Date('2026-09-17'),
        time: '16:00',
        location: 'Library Room 2',
        description: 'Group study session for Physics midterm',
        type: 'Academic',
      },
    ]);
    console.log(`Created ${events.length} events`);

    console.log('Seeding announcements...');
    const announcements = await Announcement.insertMany([
      {
        user: demoUser._id,
        subject: 'General',
        title: 'Campus Holiday Notice',
        description: 'University will be closed on Monday for national holiday',
        date: new Date('2026-09-14'),
        createdBy: 'University Admin',
      },
      {
        user: demoUser._id,
        subject: 'Mathematics',
        title: 'Assignment Deadline Extended',
        description: 'Calculus Assignment 3 deadline extended to Sept 25',
        date: new Date('2026-09-15'),
        createdBy: 'Dr. Smith',
      },
    ]);
    console.log(`Created ${announcements.length} announcements`);

    console.log('Seeding lectures...');
    const lectures = await Lecture.insertMany([
      {
        user: demoUser._id,
        subject: 'Mathematics',
        teacher: 'Dr. Smith',
        classroom: 'Room 101',
        day: 'Monday',
        startTime: '09:00',
        endTime: '10:30',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        teacher: 'Prof. Johnson',
        classroom: 'Room 204',
        day: 'Monday',
        startTime: '11:00',
        endTime: '12:30',
      },
      {
        user: demoUser._id,
        subject: 'Computer Science',
        teacher: 'Dr. Williams',
        classroom: 'Lab 3',
        day: 'Tuesday',
        startTime: '10:00',
        endTime: '12:00',
      },
      {
        user: demoUser._id,
        subject: 'English',
        teacher: 'Mrs. Brown',
        classroom: 'Room 105',
        day: 'Wednesday',
        startTime: '09:00',
        endTime: '10:30',
      },
      {
        user: demoUser._id,
        subject: 'Mathematics',
        teacher: 'Dr. Smith',
        classroom: 'Room 101',
        day: 'Wednesday',
        startTime: '14:00',
        endTime: '15:30',
      },
      {
        user: demoUser._id,
        subject: 'Chemistry',
        teacher: 'Prof. Davis',
        classroom: 'Lab 1',
        day: 'Thursday',
        startTime: '11:00',
        endTime: '13:00',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        teacher: 'Prof. Johnson',
        classroom: 'Room 204',
        day: 'Friday',
        startTime: '09:00',
        endTime: '10:30',
      },
    ]);
    console.log(`Created ${lectures.length} lectures`);

    console.log('Seeding important dates...');
    const importantDates = await ImportantDate.insertMany([
      {
        user: demoUser._id,
        title: 'Midterm Exams Begin',
        date: new Date('2026-09-20'),
        type: 'Exam',
        description: 'First round of midterm examinations',
        priority: 'High',
      },
      {
        user: demoUser._id,
        title: 'Project Proposal Due',
        date: new Date('2026-09-25'),
        type: 'Project',
        description: 'Submit final year project proposal',
        priority: 'High',
      },
      {
        user: demoUser._id,
        title: 'Science Fair',
        date: new Date('2026-10-05'),
        type: 'Event',
        description: 'Annual university science fair',
        priority: 'Medium',
      },
      {
        user: demoUser._id,
        title: 'Semester Ends',
        date: new Date('2026-12-15'),
        type: 'Other',
        description: 'Last day of fall semester',
        priority: 'Low',
      },
    ]);
    console.log(`Created ${importantDates.length} important dates`);

    console.log('\nSeeding completed successfully!');
    console.log('\nLogin credentials:');
    console.log('  Collaborator 1: msohaib.ai.dev@gmail.com / 12345678');
    console.log('  Collaborator 2: collaborator2@university.edu / 12345678');
    console.log('  Demo User:      demo@university.edu / 12345678');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seed();
