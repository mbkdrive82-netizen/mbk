const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const { Course, WebCourse, WebRegistration, WebMessage, AnalyticsEvent } = require('../models');

// @route   POST /api/web/track
// @desc    Capture analytics events
router.post('/track', async (req, res) => {
    try {
        const { eventType, path, metadata } = req.body || {};
        
        // Input validation
        if (!eventType) {
            console.warn('[/api/web/track] validation error: eventType is required');
            return res.status(400).json({ 
                success: false, 
                error: 'Bad Request',
                message: 'eventType is required in request body' 
            });
        }

        console.debug('[/api/web/track] payload:', { eventType, path, metadata });

        const event = new AnalyticsEvent({
            eventType,
            path,
            metadata,
            userAgent: req.headers['user-agent'],
            ip: req.ip
        });
        await event.save();
        return res.json({ success: true });
    } catch (err) {
        console.error('[/api/web/track] error saving analytics event:', err && err.stack ? err.stack : err);
        return res.status(500).json({ 
            success: false, 
            error: 'Internal Server Error',
            message: 'Failed to record tracking event',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

// Email Transporter Config
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.MAIL_USER || 'mbktechnologies8@gmail.com',
        pass: (process.env.MAIL_PASS || 'cici ixth yfnh icfj').replace(/\s+/g, '')
    }
});

// @route   GET /api/web/courses
// @desc    Get all active courses for public site
router.get('/courses', async (req, res) => {
    try {
        const [webCourses, adminCourses] = await Promise.all([
            WebCourse.find({ status: 'Active' }).sort({ createdAt: -1 }).lean(),
            Course.find({ isActive: { $ne: false } }).sort({ createdAt: -1 }).lean(),
        ]);

        const normalizedCourses = [];
        const seenTitles = new Set();
        const seenIds = new Set();

        const addCourse = (course) => {
            const id = String(course._id || course.id || '').trim();
            const title = String(course.title || course.name || course.label || '').trim();
            const normalizedTitle = title.toLowerCase();

            if (!id || !title) {
                return;
            }
            if (seenIds.has(id) || (normalizedTitle && seenTitles.has(normalizedTitle))) {
                return;
            }

            seenIds.add(id);
            if (normalizedTitle) {
                seenTitles.add(normalizedTitle);
            }
            normalizedCourses.push(course);
        };

        webCourses.forEach(addCourse);
        adminCourses.forEach(addCourse);

        res.json(normalizedCourses);
    } catch (err) {
        console.error('Error fetching web courses:', err && err.stack ? err.stack : err);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            message: 'Error fetching web courses from database',
            details: process.env.NODE_ENV === 'production' ? undefined : err.message
        });
    }
});

// @route   POST /api/web/register
// @desc    Public course registration
router.post('/register', async (req, res) => {
    try {
        const { studentName, phone, email, courseId } = req.body;
        const newReg = new WebRegistration(req.body);
        await newReg.save();

        let courseName = 'General Training';
        if (courseId) {
            let course = await WebCourse.findById(courseId);
            if (!course) {
                course = await Course.findById(courseId);
            }
            if (course) {
                courseName = course.title;
            }
        }

        // Notify Admin
        const mailOptions = {
            from: '"MBK Master Portal" <mbktechnologies8@gmail.com>',
            to: 'mbktechnologies8@gmail.com',
            subject: `New Web Registration: ${studentName}`,
            html: `
                <h3>New Course Registration Received via Web</h3>
                <p><strong>Name:</strong> ${studentName}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Course:</strong> ${courseName}</p>
            `
        };

        // Auto-reply to Student
        const autoReplyOptions = {
            from: '"MBK Technology" <mbktechnologies8@gmail.com>',
            to: email,
            subject: `Registration Confirmed - MBK Technology`,
            html: `
                <h2>Registration Received!</h2>
                <p>Hi ${studentName}, we've received your registration for <strong>${courseName}</strong>.</p>
                <p>Our team will contact you shortly at ${phone}.</p>
            `
        };

        transporter.sendMail(mailOptions).catch(e => console.error('Notify Admin Error:', e));
        transporter.sendMail(autoReplyOptions).catch(e => console.error('Auto Reply Error:', e));

        res.json({ success: true, message: 'Registration successful' });
    } catch (err) {
        console.error('Web registration error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   POST /api/web/contact
// @desc    Public contact form submission
router.post('/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const newMessage = new WebMessage(req.body);
        await newMessage.save();

        const mailOptions = {
            from: '"MBK Web Contact" <mbktechnologies8@gmail.com>',
            to: 'mbktechnologies8@gmail.com',
            subject: `New Contact Message: ${name}`,
            html: `<h3>New Inquiry</h3><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong> ${message}</p>`
        };

        transporter.sendMail(mailOptions).catch(e => console.error('Contact Notify Error:', e));

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (err) {
        console.error('Web contact error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
