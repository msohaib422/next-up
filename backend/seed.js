import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from './models/User.js';
import Task from './models/Task.js';
import Quiz from './models/Quiz.js';
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
        deadlineMode: 'Date',
        status: 'Pending',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        title: 'Optics Midterm',
        description: 'Covers chapters 1-5 on optics',
        date: new Date('2026-09-23'),
        time: '14:00',
        priority: 'High',
        deadlineMode: 'Date',
        status: 'Pending',
      },
      {
        user: demoUser._id,
        subject: 'Chemistry',
        title: 'Organic Chemistry Pop Quiz',
        description: 'Surprise quiz on functional groups',
        date: new Date('2026-09-15'),
        time: '09:00',
        priority: 'Medium',
        deadlineMode: 'Surprise',
        status: 'Completed',
        isSurprise: true,
      },
    ]);
    console.log(`Created ${quizzes.length} quizzes`);

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
        timeline: 'Weekly',
        notes: 'Regular weekly class',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        timeline: 'Weekly',
        notes: 'Lab sessions included',
      },
      {
        user: demoUser._id,
        subject: 'Computer Science',
        timeline: 'Monthly',
        notes: 'Programming workshops',
      },
      {
        user: demoUser._id,
        subject: 'English',
        timeline: 'Continued till next change',
      },
      {
        user: demoUser._id,
        subject: 'Mathematics',
        timeline: 'Weekly',
        notes: 'Advanced topics',
      },
      {
        user: demoUser._id,
        subject: 'Chemistry',
        timeline: 'Monthly',
        notes: 'Lab practicals',
      },
      {
        user: demoUser._id,
        subject: 'Physics',
        timeline: 'Weekly',
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
