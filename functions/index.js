const functions = require('firebase-functions');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const moment = require('moment');
const admin = require('firebase-admin');
const methodOverride = require('method-override');
const { onRequest } = require("firebase-functions/v2/https");
const fs = require('fs');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Initialize Express app
const app = express();

// Add verbose request logging
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.path} - User Agent: ${req.get('User-Agent')}`);
    next();
});

// Calendar helper functions
const isSameDay = (date1, date2) => {
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
};

// Track current view state (could be improved with sessions in a real app)
let currentCalendarView = {
    month: new Date().getMonth(),
    year: new Date().getFullYear()
};

// IMPORTANT: Updated paths for Firebase Functions deployment
// Determine the views directory path for different environments
let viewsPath = path.join(__dirname, 'views');
// For local development, the views folder might be directly in functions
if (!fs.existsSync(viewsPath)) {
    console.log('[DEBUG] Views directory not found at', viewsPath);
    // Try alternate path for deployed environment
    viewsPath = path.join(process.cwd(), 'views');
    console.log('[DEBUG] Trying alternate path:', viewsPath);
}

// View engine setup
app.set('views', viewsPath);
app.set('view engine', 'pug');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// IMPORTANT: Updated static files path
// For local development vs. deployed environment
let publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.log('[DEBUG] Public directory not found at', publicPath);
    publicPath = path.join(process.cwd(), 'public');
    console.log('[DEBUG] Trying alternate public path:', publicPath);
}
app.use(express.static(publicPath));
app.use(methodOverride('_method'));

// Print available views directories for debugging
console.log('[DEBUG] Selected views directory:', viewsPath);
console.log('[DEBUG] Current directory:', __dirname);
console.log('[DEBUG] Process current directory:', process.cwd());
console.log('[DEBUG] Files in views directory:', fs.existsSync(viewsPath) ?
    fs.readdirSync(viewsPath) : 'Directory not found');

// Template helpers
app.locals.formatDate = (date) => {
    return moment(date).format('MMM D, YYYY');
};

app.locals.truncate = (str, len) => {
    if (str && str.length > len && str.length > 0) {
        return `${str.substring(0, len)}...`;
    }
    return str || '';
};

// Firebase date handling utility
const convertTimestampToDate = (event) => {
    // Handle Firestore Timestamp objects
    if (event.startDate instanceof admin.firestore.Timestamp) {
        event.startDate = event.startDate.toDate();
    }
    // Handle serialized timestamps (from JSON)
    else if (event.startDate && event.startDate._seconds) {
        event.startDate = new Date(event.startDate._seconds * 1000);
    }

    if (event.endDate instanceof admin.firestore.Timestamp) {
        event.endDate = event.endDate.toDate();
    }
    else if (event.endDate && event.endDate._seconds) {
        event.endDate = new Date(event.endDate._seconds * 1000);
    }

    return event;
};

// IMPORTANT: Home page route that serves index with all data needed
app.get("/", async (req, res) => {
    try {
        // Get events for the homepage
        const eventsSnapshot = await db.collection('events')
            .orderBy('startDate', 'asc')
            .get();

        const events = [];
        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            events.push(convertTimestampToDate(event));
        });

        res.render('index', {
            title: 'Home',
            events  // Pass events directly to the index template
        });
    } catch (error) {
        console.error('Error rendering home page:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/events/upcoming', async (req, res) => {
    try {
        const eventsSnapshot = await db.collection('events')
            .orderBy('startDate', 'asc')
            .get();

        const events = [];
        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            events.push(convertTimestampToDate(event));
        });

        res.render('partials/event-cards', { events });
    } catch (error) {
        console.error('Error getting events:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/calendar', (req, res) => {
    console.log('[DEBUG] Rendering calendar page');
    try {
        res.render('calendar', {
            title: 'Calendar View'
        });
        console.log('[DEBUG] Calendar page rendered successfully');
    } catch (error) {
        console.error('[ERROR] Failed to render calendar page:', error);
        res.status(500).send(`Calendar page error: ${error.message}`);
    }
});

app.get('/events/new', (req, res) => {
    console.log('[DEBUG] Rendering new event form');
    try {
        res.render('event-form', {
            title: 'Add New Event',
            event: {} // Empty event for a new form
        });
        console.log('[DEBUG] New event form rendered successfully');
    } catch (error) {
        console.error('[ERROR] Failed to render new event form:', error);
        res.status(500).send(`New event form error: ${error.message} in ${viewsPath}`);
    }
});

app.post('/events', async (req, res) => {
    try {
        console.log('[DEBUG] Event submission received:', req.body);

        // Parse and validate dates before conversion
        let startDateStr = req.body.startDate;
        let endDateStr = req.body.endDate;

        // Validate date strings
        if (!startDateStr || !endDateStr) {
            throw new Error('Start and end dates are required');
        }

        console.log('[DEBUG] Raw date strings:', { startDateStr, endDateStr });

        // Convert to Firestore Timestamps directly
        const startDate = admin.firestore.Timestamp.fromDate(new Date(startDateStr));
        const endDate = admin.firestore.Timestamp.fromDate(new Date(endDateStr));

        console.log('[DEBUG] Converted dates:', {
            startDate: startDate.toDate(),
            endDate: endDate.toDate()
        });

        const newEvent = {
            title: req.body.title,
            description: req.body.description,
            startDate: startDate,
            endDate: endDate,
            location: req.body.location,
            color: req.body.color || 'blue'
        };

        console.log('[DEBUG] Prepared event object:', JSON.stringify(newEvent, (key, value) => {
            if (value && value.constructor && value.constructor.name === 'Timestamp') {
                return `Timestamp(${value.seconds})`;
            }
            return value;
        }));

        const docRef = await db.collection('events').add(newEvent);
        console.log('[DEBUG] Event added successfully with ID:', docRef.id);

        res.redirect(`/`); // Redirect to home page after adding
    } catch (error) {
        console.error('[ERROR] Error adding event:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/events/:id', async (req, res) => {
    try {
        const eventDoc = await db.collection('events').doc(req.params.id).get();

        if (!eventDoc.exists) {
            return res.status(404).send('Event not found');
        }

        const event = convertTimestampToDate({ id: eventDoc.id, ...eventDoc.data() });
        const referer = req.get('Referer');

        res.render('event-detail', {
            title: event.title,
            event,
            referer
        });
    } catch (error) {
        console.error('Error getting event:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/events/:id/edit', async (req, res) => {
    try {
        const eventDoc = await db.collection('events').doc(req.params.id).get();

        if (!eventDoc.exists) {
            return res.status(404).send('Event not found');
        }

        const event = convertTimestampToDate({ id: eventDoc.id, ...eventDoc.data() });

        res.render('event-form', {
            title: 'Edit Event',
            event,
            isEdit: true
        });
    } catch (error) {
        console.error('Error getting event:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.post('/events/:id', async (req, res) => {
    try {
        const eventId = req.params.id;
        const updatedEvent = {
            title: req.body.title,
            description: req.body.description,
            startDate: new Date(req.body.startDate),
            endDate: new Date(req.body.endDate),
            location: req.body.location,
            color: req.body.color
        };

        await db.collection('events').doc(eventId).update(updatedEvent);

        res.redirect(`/`);
    } catch (error) {
        console.error('Error updating event:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.delete('/events/:id', async (req, res) => {
    try {
        const eventId = req.params.id;

        await db.collection('events').doc(eventId).delete();

        // Get updated events list
        const eventsSnapshot = await db.collection('events')
            .orderBy('startDate', 'asc')
            .get();

        const events = [];
        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            events.push(convertTimestampToDate(event));
        });

        res.render('partials/event-cards', { events });
    } catch (error) {
        console.error('Error deleting event:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/calendar/view', async (req, res) => {
    try {
        const { month, year } = currentCalendarView;

        const eventsSnapshot = await db.collection('events').get();
        const events = [];

        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            events.push(convertTimestampToDate(event));
        });

        res.render('partials/calendar-grid', {
            month,
            year,
            events,
            isSameDay
        });
    } catch (error) {
        console.error('Error getting events for calendar:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

app.get('/calendar/navigation', async (req, res) => {
    try {
        const direction = req.query.direction;

        if (direction === 'prev') {
            if (currentCalendarView.month === 0) {
                currentCalendarView.month = 11;
                currentCalendarView.year--;
            } else {
                currentCalendarView.month--;
            }
        } else if (direction === 'next') {
            if (currentCalendarView.month === 11) {
                currentCalendarView.month = 0;
                currentCalendarView.year++;
            } else {
                currentCalendarView.month++;
            }
        }

        const eventsSnapshot = await db.collection('events').get();
        const events = [];

        eventsSnapshot.forEach(doc => {
            const event = { id: doc.id, ...doc.data() };
            events.push(convertTimestampToDate(event));
        });

        // Get the month and year name
        const monthName = moment(new Date(currentCalendarView.year, currentCalendarView.month)).format('MMMM YYYY');

        // Set header for HTMX to pick up
        res.setHeader('X-Calendar-Month', monthName);

        res.render('partials/calendar-grid', {
            month: currentCalendarView.month,
            year: currentCalendarView.year,
            events,
            isSameDay,
            monthName
        });
    } catch (error) {
        console.error('Error navigating calendar:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day); // JS months are 0-indexed
}

app.get('/calendar/day-events', async (req, res) => {
    try {
        const dateString = req.query.date;
        const date = parseLocalDate(dateString);

        const eventsSnapshot = await db.collection('events').get();
        const matchingEvents = [];

        eventsSnapshot.forEach(doc => {
            const event = convertTimestampToDate({ id: doc.id, ...doc.data() });
            if (isSameDay(new Date(event.startDate), date)) {
                matchingEvents.push(event);
            }
        });

        res.render('partials/event-cards', { events: matchingEvents });
    } catch (error) {
        console.error('Error getting day events:', error);
        res.status(500).send(`Server error: ${error.message}`);
    }
});

// IMPORTANT: Add detailed 404 handler
app.use((req, res, next) => {
    console.log(`[ERROR] 404 Not Found: ${req.method} ${req.path}`);
    console.log('[DEBUG] Request headers:', req.headers);
    console.log('[DEBUG] Views directory content:', fs.existsSync(viewsPath) ?
        fs.readdirSync(viewsPath) : 'Directory not found');

    res.status(404).send(`
        <h1>Page Not Found: ${req.url}</h1>
        <p>The page you requested could not be found. This could be due to:</p>
        <ul>
            <li>Incorrect URL</li>
            <li>Missing template files in ${viewsPath}</li>
            <li>Path resolution issues</li>
        </ul>
        <p>Check Firebase logs for more details.</p>
    `);
});

// Error handler middleware
app.use((err, req, res, next) => {
    console.error('[ERROR] Express error handler:', err);
    res.status(500).send(`
        <h1>Server Error</h1>
        <p>Something went wrong on the server. Error: ${err.message}</p>
    `);
});

// Export the Express app as a Firebase Function
exports.app = onRequest({
    timeoutSeconds: 300,     // Increased timeout
    memory: '1GiB',         // Increased memory
}, app);