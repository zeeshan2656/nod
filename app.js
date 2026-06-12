/**
 * Node.js Hosting Test App - Main Application File
 * 
 * This file sets up the Express server, session configuration, route handlers,
 * and retrieves server environment metrics (hostname, Node.js version, server time).
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');

// Initialize the Express Application
const app = express();

// Define Port (Fallback to 3000 for local development; cPanel Phusion Passenger sets process.env.PORT)
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. Template Engine & Static File Settings
// ==========================================

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static assets (CSS, Images, JS) from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Parse URL-encoded bodies (form submissions)
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 2. Session Configuration
// ==========================================
app.use(session({
  secret: 'cpanel-node-hosting-test-app-secret-1845927591', // Secret key used to sign session ID cookie
  resave: false,                                           // Do not save session if unmodified
  saveUninitialized: false,                                // Do not create session until something is stored
  cookie: { 
    maxAge: 1000 * 60 * 30,                                // Session expiration: 30 minutes
    secure: false,                                         // Set to true only if deploying with HTTPS
    httpOnly: true                                         // Prevent Client-Side JS from accessing the cookie
  }
}));

// ==========================================
// 3. Authentication & Authorization Middleware
// ==========================================

/**
 * Middleware to protect routes that require a logged-in session.
 * Redirects user to the login page if they are not authenticated.
 */
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next(); // Session exists, proceed to the route handler
  } else {
    return res.redirect('/login'); // No session, redirect to login page
  }
}

/**
 * Middleware to redirect already logged-in users away from auth pages (welcome / login)
 * directly to the protected dashboard page.
 */
function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

// ==========================================
// 4. Route Handlers
// ==========================================

/**
 * GET /
 * Welcome / Landing Page.
 */
app.get('/', redirectIfLoggedIn, (req, res) => {
  res.render('welcome');
});

/**
 * GET /login
 * Render login screen. Retrieves any login error stored in session,
 * passes it to template, then clears it so it doesn't persist on page reload.
 */
app.get('/login', redirectIfLoggedIn, (req, res) => {
  const error = req.session.error || null;
  // Clear the error message after reading it
  req.session.error = null;
  res.render('login', { error });
});

/**
 * POST /login
 * Validate credentials against hardcoded values (Username: 123, Password: 123)
 */
app.post('/login', redirectIfLoggedIn, (req, res) => {
  const { username, password } = req.body;
  
  // Hardcoded authentication check
  if (username === '123' && password === '123') {
    // Generate session user object
    req.session.user = {
      username: username
    };
    
    // Redirect to the protected dashboard
    res.redirect('/dashboard');
  } else {
    // Set error message in session and redirect back to login form
    req.session.error = 'Invalid Username or Password';
    res.redirect('/login');
  }
});

/**
 * GET /dashboard
 * Protected Dashboard. Retrieves current environment statistics
 * and renders the status dashboard.
 */
app.get('/dashboard', requireLogin, (req, res) => {
  // Retrieve server statistics
  const serverTime = new Date().toLocaleString(); // Format local server date & time
  const nodeVersion = process.version;            // Running Node.js version
  const hostname = os.hostname();                 // Host name of server
  const username = req.session.user.username;     // Retrieve username from session

  res.render('dashboard', {
    serverTime,
    nodeVersion,
    hostname,
    username
  });
});

/**
 * GET /logout
 * Destroys current session and redirects to welcome screen.
 */
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    // Redirect to welcome screen regardless of session destroy error status
    res.redirect('/');
  });
});

// ==========================================
// 5. Server Startup
// ==========================================
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` Node.js Hosting Test App running on Port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Access local URL: http://localhost:${PORT}`);
  console.log(`===================================================`);
});
