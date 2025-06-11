const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// In-memory storage (replace with Redis/PostgreSQL in production)
const users = new Map();
const forms = new Map();
const formResponses = new Map();
const activeSessions = new Map(); // formId -> Set of socket connections
const fieldLocks = new Map(); // formId -> fieldName -> userId

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Utility functions
const generateShareCode = () => {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
};

const validateFormField = (field) => {
  const validTypes = ['text', 'number', 'email', 'dropdown', 'date', 'textarea'];
  if (!validTypes.includes(field.type)) {
    throw new Error(`Invalid field type: ${field.type}`);
  }
  
  if (!field.name || field.name.trim() === '') {
    throw new Error('Field name is required');
  }
  
  return true;
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    const user = {
      id: userId,
      username,
      email,
      password: hashedPassword,
      role,
      createdAt: new Date()
    };
    
    users.set(userId, user);
    
    const token = jwt.sign(
      { userId, username, email, role }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: userId, username, email, role }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = Array.from(users.values()).find(u => u.email === email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Form Routes
app.get('/api/forms', authenticateToken, (req, res) => {
  try {
    const userForms = Array.from(forms.values())
      .filter(form => form.createdBy === req.user.userId)
      .map(form => ({
        ...form,
        responseCount: formResponses.has(form.id) ? 1 : 0,
        activeUsers: activeSessions.has(form.id) ? activeSessions.get(form.id).size : 0
      }));
    
    res.json(userForms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/forms', authenticateToken, (req, res) => {
  try {
    const { title, description, fields } = req.body;
    
    if (!title || !fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: 'Title and fields are required' });
    }
    
    // Validate fields
    fields.forEach(validateFormField);
    
    const formId = uuidv4();
    const shareCode = generateShareCode();
    
    const form = {
      id: formId,
      title,
      description,
      fields,
      shareCode,
      createdBy: req.user.userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    forms.set(formId, form);
    
    res.status(201).json({
      message: 'Form created successfully',
      form
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/forms/:id', authenticateToken, (req, res) => {
  try {
    const form = forms.get(req.params.id);
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    // Check if user is the creator or if it's a shared form access
    if (form.createdBy !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const response = formResponses.get(req.params.id);
    const activeUsers = activeSessions.has(req.params.id) ? 
      activeSessions.get(req.params.id).size : 0;
    
    res.json({
      ...form,
      response,
      activeUsers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/forms/join/:shareCode', (req, res) => {
  try {
    const form = Array.from(forms.values())
      .find(f => f.shareCode === req.params.shareCode);
    
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    const response = formResponses.get(form.id) || {};
    const activeUsers = activeSessions.has(form.id) ? 
      activeSessions.get(form.id).size : 0;
    
    res.json({
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        fields: form.fields
      },
      response,
      activeUsers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/forms/:id/response', (req, res) => {
  try {
    const { fieldName, value } = req.body;
    const formId = req.params.id;
    
    const form = forms.get(formId);
    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }
    
    // Validate field exists in form
    const field = form.fields.find(f => f.name === fieldName);
    if (!field) {
      return res.status(400).json({ error: 'Field not found in form' });
    }
    
    // Get or create response
    let response = formResponses.get(formId) || {};
    response[fieldName] = value;
    response.updatedAt = new Date();
    
    formResponses.set(formId, response);
    
    res.json({
      message: 'Response updated successfully',
      response
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join_form', (data) => {
    const { formId, userId, username } = data;
    
    // Validate form exists
    const form = forms.get(formId);
    if (!form) {
      socket.emit('error', { message: 'Form not found' });
      return;
    }
    
    // Join form room
    socket.join(formId);
    socket.formId = formId;
    socket.userId = userId;
    socket.username = username;
    
    // Track active session
    if (!activeSessions.has(formId)) {
      activeSessions.set(formId, new Set());
    }
    activeSessions.get(formId).add(socket);
    
    // Notify others about new user
    socket.to(formId).emit('user_joined', {
      userId,
      username,
      activeUsers: activeSessions.get(formId).size
    });
    
    // Send current form state to new user
    const response = formResponses.get(formId) || {};
    const locks = {};
    
    // Get current field locks for this form
    if (fieldLocks.has(formId)) {
      const formLocks = fieldLocks.get(formId);
      formLocks.forEach((lockedUserId, fieldName) => {
        locks[fieldName] = lockedUserId;
      });
    }
    
    socket.emit('form_state', {
      response,
      locks,
      activeUsers: activeSessions.get(formId).size
    });
    
    console.log(`User ${username} joined form ${formId}`);
  });
  
  socket.on('field_update', (data) => {
    const { formId, fieldName, value, userId } = data;
    
    if (socket.formId !== formId) {
      socket.emit('error', { message: 'Invalid form access' });
      return;
    }
    
    // Check if field is locked by another user
    if (fieldLocks.has(formId)) {
      const formLocks = fieldLocks.get(formId);
      const lockOwner = formLocks.get(fieldName);
      if (lockOwner && lockOwner !== userId) {
        socket.emit('field_locked', { fieldName, lockedBy: lockOwner });
        return;
      }
    }
    
    // Update response
    let response = formResponses.get(formId) || {};
    response[fieldName] = value;
    response.updatedAt = new Date();
    formResponses.set(formId, response);
    
    // Broadcast update to all users in the form
    socket.to(formId).emit('field_updated', {
      fieldName,
      value,
      userId,
      username: socket.username
    });
    
    console.log(`Field ${fieldName} updated in form ${formId} by ${socket.username}`);
  });
  
  socket.on('field_lock', (data) => {
    const { formId, fieldName, userId } = data;
    
    if (socket.formId !== formId) {
      socket.emit('error', { message: 'Invalid form access' });
      return;
    }
    
    // Initialize form locks if needed
    if (!fieldLocks.has(formId)) {
      fieldLocks.set(formId, new Map());
    }
    
    const formLocks = fieldLocks.get(formId);
    
    // Check if field is already locked
    if (formLocks.has(fieldName) && formLocks.get(fieldName) !== userId) {
      socket.emit('field_locked', { 
        fieldName, 
        lockedBy: formLocks.get(fieldName) 
      });
      return;
    }
    
    // Lock the field
    formLocks.set(fieldName, userId);
    
    // Notify all users about the lock
    io.to(formId).emit('field_locked', {
      fieldName,
      lockedBy: userId,
      username: socket.username
    });
    
    // Auto-unlock after 30 seconds of inactivity
    setTimeout(() => {
      if (formLocks.get(fieldName) === userId) {
        formLocks.delete(fieldName);
        io.to(formId).emit('field_unlocked', { fieldName });
      }
    }, 30000);
    
    console.log(`Field ${fieldName} locked by ${socket.username} in form ${formId}`);
  });
  
  socket.on('field_unlock', (data) => {
    const { formId, fieldName, userId } = data;
    
    if (socket.formId !== formId) {
      socket.emit('error', { message: 'Invalid form access' });
      return;
    }
    
    if (fieldLocks.has(formId)) {
      const formLocks = fieldLocks.get(formId);
      
      // Only allow unlock if user owns the lock
      if (formLocks.get(fieldName) === userId) {
        formLocks.delete(fieldName);
        
        // Notify all users about the unlock
        io.to(formId).emit('field_unlocked', { fieldName });
        
        console.log(`Field ${fieldName} unlocked by ${socket.username} in form ${formId}`);
      }
    }
  });
  
  socket.on('disconnect', () => {
    if (socket.formId) {
      // Remove from active sessions
      if (activeSessions.has(socket.formId)) {
        activeSessions.get(socket.formId).delete(socket);
        
        // Clean up empty sessions
        if (activeSessions.get(socket.formId).size === 0) {
          activeSessions.delete(socket.formId);
        }
      }
      
      // Release any field locks held by this user
      if (fieldLocks.has(socket.formId)) {
        const formLocks = fieldLocks.get(socket.formId);
        const locksToRelease = [];
        
        formLocks.forEach((userId, fieldName) => {
          if (userId === socket.userId) {
            locksToRelease.push(fieldName);
          }
        });
        
        locksToRelease.forEach(fieldName => {
          formLocks.delete(fieldName);
          socket.to(socket.formId).emit('field_unlocked', { fieldName });
        });
      }
      
      // Notify others about user leaving
      socket.to(socket.formId).emit('user_left', {
        userId: socket.userId,
        username: socket.username,
        activeUsers: activeSessions.has(socket.formId) ? 
          activeSessions.get(socket.formId).size : 0
      });
    }
    
    console.log('User disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    activeConnections: io.engine.clientsCount,
    activeForms: activeSessions.size
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = server;