const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const moment = require('moment'); // You'll need to install this: npm install moment

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

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

// Pug template engine setup
app.set('views', path.join(__dirname, 'src/views'));
app.set('view engine', 'pug');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
const methodOverride = require('method-override');
app.use(methodOverride('_method'));


// Template helpers
app.locals.formatDate = (date) => {
    return moment(date).format('MMM D, YYYY');
};

app.locals.truncate = (str, len) => {
    if (str.length > len && str.length > 0) {
        return `${str.substring(0, len)}...`;
    }
    return str;
};

// Mock data for initial development
const mockEvents = [
    {
        id: '1',
        title: 'Team Meeting',
        description: 'Weekly team sync to discuss project progress and blockers.',
        startDate: new Date('2025-05-10T10:00:00'),
        endDate: new Date('2025-05-10T11:00:00'),
        location: 'Conference Room A',
        color: 'blue'
    },
    {
        id: '2',
        title: 'Project Deadline',
        description: 'Final submission deadline for the Q2 project.',
        startDate: new Date('2025-05-15T23:59:59'),
        endDate: new Date('2025-05-15T23:59:59'),
        color: 'red'
    },
    {
        id: '3',
        title: 'Lunch with Client',
        description: 'Networking lunch with potential new client to discuss opportunities.',
        startDate: new Date('2025-05-12T12:30:00'),
        endDate: new Date('2025-05-12T13:30:00'),
        location: 'Downtown Bistro',
        color: 'green'
    }
];

// Routes
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Calendar App - Upcoming Events'
    });
});

app.get('/events/upcoming', (req, res) => {
    // In a real app, this would fetch from Firebase
    // For now we're using mock data
    res.render('partials/event-cards', {
        events: mockEvents.sort((a, b) => a.startDate - b.startDate)
    });
});

app.get('/calendar', (req, res) => {
    res.render('calendar', {
        title: 'Calendar View',
        events: mockEvents
    });
});

app.get('/events/new', (req, res) => {
    res.render('event-form', {
        title: 'Add New Event',
        event: {} // Empty event for a new form
    });
});

app.get('/events/:id', (req, res) => {
    const event = mockEvents.find(e => e.id === req.params.id);

    if (!event) {
        return res.status(404).send('Event not found');
    }

    // Capture the Referer URL from the headers
    const referer = req.get('Referer'); // This will capture the previous URL

    // Render the event detail page and pass the referer
    res.render('event-detail', {
        title: event.title,
        event,
        referer // Pass the referer URL to the template
    });
});

app.get('/events/:id/edit', (req, res) => {
    const event = mockEvents.find(e => e.id === req.params.id);
    if (!event) {
        return res.status(404).send('Event not found');
    }
    res.render('event-form', {
        title: 'Edit Event',
        event,
        isEdit: true
    });
});


// Add DELETE handler for events
app.delete('/events/:id', (req, res) => {
    const eventId = req.params.id;

    // In a real app, this would delete from Firebase
    // For now we just filter the mock data
    const eventIndex = mockEvents.findIndex(e => e.id === eventId);

    if (eventIndex !== -1) {
        mockEvents.splice(eventIndex, 1);

        // Return the updated events list
        return res.render('partials/event-cards', {
            events: mockEvents.sort((a, b) => a.startDate - b.startDate)
        });
    }

    res.status(404).send('Event not found');
});

// Routes for calendar
app.get('/calendar', (req, res) => {
    res.render('calendar', {
        title: 'Calendar View'
    });
});

app.get('/calendar/view', (req, res) => {
    const { month, year } = currentCalendarView;

    res.render('partials/calendar-grid', {
        month,
        year,
        events: mockEvents,
        isSameDay
    });
});

app.get('/calendar/navigation', (req, res) => {
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

    // Get the month and year name
    const monthName = moment(new Date(currentCalendarView.year, currentCalendarView.month)).format('MMMM YYYY');
    // Set header for HTMX to pick up
    res.setHeader('X-Calendar-Month', monthName);
    res.render('partials/calendar-grid', {
        month: currentCalendarView.month,
        year: currentCalendarView.year,
        events: mockEvents,
        isSameDay,
        monthName
    });
});
function parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day); // JS months are 0-indexed
}

app.get('/calendar/day-events', (req, res) => {
    const dateString = req.query.date;
    const date = parseLocalDate(dateString); // Use the new function

    const matchingEvents = mockEvents.filter(event =>
        isSameDay(new Date(event.startDate), date)
    );

    console.log(`Matching events for date ${dateString}`, matchingEvents);
    res.render('partials/event-cards', { events: matchingEvents });
});




// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});