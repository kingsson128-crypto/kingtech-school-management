// backend/server.js - SENDGRID VERSION (ALL ROUTES PRESERVED)
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const sgMail = require('@sendgrid/mail'); // SendGrid for emails

const app = express();

// ===== Config from .env =====
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY; // email

if (!MONGO_URI) {
  console.error('❌ MONGO_URI is not defined in .env');
  process.exit(1);
}

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== MongoDB connection =====
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ===== SendGrid Setup  =====
sgMail.setApiKey(SENDGRID_API_KEY);

// ===== Schemas & Models  =====
const paymentSchema = new mongoose.Schema({
  amount: Number,
  date: String,
});

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, required: true },
  class: { type: String, required: true },
  fees: {
    due: { type: Number, required: true },
    payments: [paymentSchema],
  },
});

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subject: { type: String, required: true },
  role: { type: String, required: true },
  classTeacherClass: { type: String, default: '' },
  email: { type: String, required: true },
});

const classSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teacher: { type: String, default: '' },
  leader: { type: String, default: '' },
});

const announcementSchema = new mongoose.Schema({
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Student = mongoose.model('Student', studentSchema);
const Teacher = mongoose.model('Teacher', teacherSchema);
const ClassModel = mongoose.model('Class', classSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);

// ===== Helper: SendGrid version =====
async function sendAnnouncementEmailToTeachers(announcementText) {
  try {
    console.log('📧 SendGrid: Sending announcement to teachers...');
    const teachers = await Teacher.find({ email: { $exists: true, $ne: '' } });
    if (teachers.length === 0) {
      console.log('No teachers with email to notify');
      return;
    }

    // Send individual emails (SendGrid doesn't like huge TO lists)
    for (const teacher of teachers) {
      const msg = {
        to: teacher.email, // REAL Gmail delivery!
        from: process.env.EMAIL_FROM || 'Kingtech School <kingsson128@gmail.com>',
        subject: ' New School Announcement',
        text: announcementText
      };
      
      await sgMail.send(msg);
      console.log(`✅ SendGrid sent to ${teacher.email}`);
    }
  } catch (err) {
    console.error('SendGrid error:', err.response?.body || err.message);
  }
}

// ===== Routes  =====

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Kingtech School API running with SendGrid 🚀' });
});

// ===== STUDENTS  =====
// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const students = await Student.find();
    res.json(students);
  } catch (err) {
    console.error('GET /api/students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create a new student
app.post('/api/students', async (req, res) => {
  try {
    const { name, age, class: sclass, feesDue } = req.body;

    if (!name || !age || !sclass || !feesDue) {
      return res
        .status(400)
        .json({ error: 'name, age, class, feesDue are required' });
    }

    const student = new Student({
      name,
      age,
      class: sclass,
      fees: { due: feesDue, payments: [] },
    });

    const saved = await student.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/students error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a student
app.patch('/api/students/:id', async (req, res) => {
  try {
    const { name, age, class: sclass, feesDue } = req.body;

    console.log('PATCH /api/students/:id body:', req.body);

    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (typeof name === 'string') student.name = name;
    if (typeof age === 'number') student.age = age;
    if (typeof sclass === 'string') student.class = sclass;
    if (typeof feesDue === 'number') student.fees.due = feesDue;

    const saved = await student.save();
    res.json(saved);
  } catch (err) {
    console.error('PATCH /api/students/:id error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// Add a payment for a student
app.post('/api/students/:id/payments', async (req, res) => {
  try {
    const { amount, date } = req.body;

    if (!amount || !date) {
      return res.status(400).json({ error: 'amount and date are required' });
    }

    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    student.fees.payments.push({ amount, date });
    const saved = await student.save();
    res.json(saved);
  } catch (err) {
    console.error('POST /api/students/:id/payments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a student
app.delete('/api/students/:id', async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/students/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== TEACHERS  =====
// Get all teachers
app.get('/api/teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find();
    res.json(teachers);
  } catch (err) {
    console.error('GET /api/teachers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create teacher (STRICT one-class-one-class-teacher)
app.post('/api/teachers', async (req, res) => {
  try {
    const { name, subject, role, classTeacherClass, email } = req.body;
    if (!name || !subject || !role || !email) {
      return res.status(400).json({ error: 'name, subject, role, email are required' });
    }

    // If this teacher is a Class Teacher, enforce that the class has no other class teacher
    if (role === 'Class Teacher' && classTeacherClass) {
      // Check if some OTHER teacher is already class teacher for this class
      const existing = await Teacher.findOne({
        role: 'Class Teacher',
        classTeacherClass: classTeacherClass
      });
      if (existing) {
        return res.status(400).json({
          error: `Class "${classTeacherClass}" already has a class teacher (${existing.name}).`
        });
      }
    }

    const teacher = new Teacher({
      name,
      subject,
      role,
      email,
      classTeacherClass: role === 'Class Teacher' ? (classTeacherClass || '') : ''
    });

    const saved = await teacher.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/teachers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a teacher (STRICT one-class-one-class-teacher)
app.patch('/api/teachers/:id', async (req, res) => {
  try {
    const { name, subject, role, classTeacherClass, email } = req.body;

    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });

    // Apply basic updates
    if (typeof name === 'string') teacher.name = name;
    if (typeof subject === 'string') teacher.subject = subject;
    if (typeof role === 'string') teacher.role = role;
    if (typeof email === 'string') teacher.email = email;

    // STRICT rule check
    if (role === 'Class Teacher') {
      if (classTeacherClass) {
        // If changing/setting classTeacherClass, ensure no other teacher is class teacher of this class
        const existing = await Teacher.findOne({
          role: 'Class Teacher',
          classTeacherClass: classTeacherClass,
          _id: { $ne: teacher._id } // exclude this teacher
        });
        if (existing) {
          return res.status(400).json({
            error: `Class "${classTeacherClass}" already has a class teacher (${existing.name}).`
          });
        }
        teacher.classTeacherClass = classTeacherClass;
      } else {
        teacher.classTeacherClass = '';
      }
    } else {
      // Not a Class Teacher => must NOT have classTeacherClass
      teacher.classTeacherClass = '';
    }

    const saved = await teacher.save();
    res.json(saved);
  } catch (err) {
    console.error('PATCH /api/teachers/:id error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});


// Delete teacher
app.delete('/api/teachers/:id', async (req, res) => {
  try {
    await Teacher.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('DELETE /api/teachers/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== CLASSES  =====
// Get all classes
app.get('/api/classes', async (req, res) => {
  try {
    const classes = await ClassModel.find();
    res.json(classes);
  } catch (err) {
    console.error('GET /api/classes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Initialize base classes if none exist
app.post('/api/classes/init', async (req, res) => {
  try {
    const existing = await ClassModel.countDocuments();
    if (existing > 0) {
      return res.status(400).json({ error: 'Classes already initialized' });
    }
    const base = [
      { name: 'Grade 1' },
      { name: 'Grade 2' },
      { name: 'Grade 3' },
      { name: 'Grade 4' },
      { name: 'Grade 5' },
      { name: 'Grade 6' },
      { name: 'Grade 7' },
      { name: 'Grade 8' },
      { name: 'Grade 9' },
    ];
    const created = await ClassModel.insertMany(base);
    res.status(201).json(created);
  } catch (err) {
    console.error('POST /api/classes/init error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a class teacher or leader
app.patch('/api/classes/:id', async (req, res) => {
  try {
    const { teacher, leader } = req.body;
    const cls = await ClassModel.findById(req.params.id);
    if (!cls) return res.status(404).json({ error: 'Class not found' });

    if (typeof teacher === 'string') cls.teacher = teacher;
    if (typeof leader === 'string') cls.leader = leader;

    const saved = await cls.save();
    res.json(saved);
  } catch (err) {
    console.error('PATCH /api/classes/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// Get all announcements (newest first)
app.get('/api/announcements', async (req, res) => {
  try {
    const anns = await Announcement.find().sort({ createdAt: -1 });
    res.json(anns);
  } catch (err) {
    console.error('GET /api/announcements error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create announcement + SendGrid to teachers
app.post('/api/announcements', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    const ann = new Announcement({ text });
    const saved = await ann.save();

    // SendGrid to REAL teacher emails (fire-and-forget)
    sendAnnouncementEmailToTeachers(saved.text);

    res.status(201).json(saved);
  } catch (err) {
    console.error('POST /api/announcements error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log(`✅ Kingtech School + SendGrid running on http://localhost:${PORT}`);
});
