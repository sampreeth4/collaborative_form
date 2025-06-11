import React, { useState, useEffect, useRef } from 'react';
import { Users, Lock, Unlock, Eye, Plus, Settings, Share2, Copy, CheckCircle } from 'lucide-react';

// Mock API service
const API_BASE = 'http://localhost:3001/api';

const apiService = {
  async login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return response.json();
  },
  
  async register(username, email, password, role = 'user') {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, role })
    });
    return response.json();
  },
  
  async getForms(token) {
    const response = await fetch(`${API_BASE}/forms`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return response.json();
  },
  
  async createForm(formData, token) {
    const response = await fetch(`${API_BASE}/forms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });
    return response.json();
  },
  
  async joinForm(shareCode) {
    const response = await fetch(`${API_BASE}/forms/join/${shareCode}`);
    return response.json();
  }
};

// Mock Socket.IO implementation for demo
class MockSocket {
  constructor() {
    this.events = {};
    this.connected = false;
  }
  
  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }
  
  emit(event, data) {
    console.log('Socket emit:', event, data);
    // Simulate responses for demo
    setTimeout(() => {
      if (event === 'join_form') {
        this.trigger('form_state', {
          response: {},
          locks: {},
          activeUsers: Math.floor(Math.random() * 5) + 1
        });
      }
    }, 100);
  }
  
  trigger(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }
  
  disconnect() {
    this.connected = false;
  }
}

// Authentication Context
const AuthContext = React.createContext();

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  
  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser({
          id: payload.userId,
          username: payload.username,
          email: payload.email,
          role: payload.role
        });
      } catch (error) {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, [token]);
  
  const login = async (email, password) => {
    try {
      const result = await apiService.login(email, password);
      if (result.token) {
        localStorage.setItem('token', result.token);
        setToken(result.token);
        setUser(result.user);
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
  
  const register = async (username, email, password, role) => {
    try {
      const result = await apiService.register(username, email, password, role);
      if (result.token) {
        localStorage.setItem('token', result.token);
        setToken(result.token);
        setUser(result.user);
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
  
  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };
  
  return (
    <AuthContext.Provider value={{ user, token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Login Component
const LoginForm = ({ onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      let result;
      if (isLogin) {
        result = await login(email, password);
      } else {
        result = await register(username, email, password, role);
      }
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Collaborative Forms</h1>
          <p className="text-gray-600 mt-2">Real-time form collaboration platform</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          )}
          
          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {isLogin ? "Don't have an account? Register" : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
};

// Form Builder Component
const FormBuilder = ({ onFormCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const { token } = useAuth();
  
  const fieldTypes = [
    { value: 'text', label: 'Text Input' },
    { value: 'textarea', label: 'Text Area' },
    { value: 'number', label: 'Number' },
    { value: 'email', label: 'Email' },
    { value: 'date', label: 'Date' },
    { value: 'dropdown', label: 'Dropdown' }
  ];
  
  const addField = () => {
    setFields([...fields, {
      id: Date.now(),
      name: '',
      type: 'text',
      label: '',
      required: false,
      options: []
    }]);
  };
  
  const updateField = (id, updates) => {
    setFields(fields.map(field => 
      field.id === id ? { ...field, ...updates } : field
    ));
  };
  
  const removeField = (id) => {
    setFields(fields.filter(field => field.id !== id));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const formData = {
        title,
        description,
        fields: fields.map(({ id, ...field }) => ({
          ...field,
          name: field.name || field.label.toLowerCase().replace(/\s+/g, '_')
        }))
      };
      
      const result = await apiService.createForm(formData, token);
      if (result.form) {
        onFormCreated(result.form);
        setShowBuilder(false);
        setTitle('');
        setDescription('');
        setFields([]);
      }
    } catch (error) {
      console.error('Error creating form:', error);
    }
  };
  
  if (!showBuilder) {
    return (
      <button
        onClick={() => setShowBuilder(true)}
        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Plus size={20} />
        Create New Form
      </button>
    );
  }
  
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Create New Form</h2>
        <button
          onClick={() => setShowBuilder(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Form Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
          />
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Form Fields</h3>
            <button
              type="button"
              onClick={addField}
              className="flex items-center gap-2 bg-green-600 text-white px-3 py-1 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus size={16} />
              Add Field
            </button>
          </div>
          
          {fields.map((field, index) => (
            <div key={field.id} className="border border-gray-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Field {index + 1}</span>
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Remove
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Label
                  </label>
                  <input
                    type="text"
                    value={field.label}
                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {fieldTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              {field.type === 'dropdown' && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Options (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={field.options.join(', ')}
                    onChange={(e) => updateField(field.id, { 
                      options: e.target.value.split(',').map(opt => opt.trim()).filter(opt => opt)
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </div>
              )}
              
              <div className="mt-3">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => updateField(field.id, { required: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Required field</span>
                </label>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex gap-4">
          <button
            type="submit"
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Form
          </button>
          <button
            type="button"
            onClick={() => setShowBuilder(false)}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

// Collaborative Form Component
const CollaborativeForm = ({ form, onBack }) => {
  const [response, setResponse] = useState({});
  const [locks, setLocks] = useState({});
  const [activeUsers, setActiveUsers] = useState(0);
  const [socket, setSocket] = useState(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const updateTimeoutRef = useRef(null);
  
  useEffect(() => {
    // Initialize mock socket
    const mockSocket = new MockSocket();
    setSocket(mockSocket);
    
    // Set up socket listeners
    mockSocket.on('form_state', (data) => {
      setResponse(data.response || {});
      setLocks(data.locks || {});
      setActiveUsers(data.activeUsers || 1);
    });
    
    mockSocket.on('field_updated', (data) => {
      setResponse(prev => ({ ...prev, [data.fieldName]: data.value }));
    });
    
    mockSocket.on('field_locked', (data) => {
      setLocks(prev => ({ ...prev, [data.fieldName]: data.lockedBy }));
    });
    
    mockSocket.on('field_unlocked', (data) => {
      setLocks(prev => {
        const newLocks = { ...prev };
        delete newLocks[data.fieldName];
        return newLocks;
      });
    });
    
    mockSocket.on('user_joined', (data) => {
      setActiveUsers(data.activeUsers);
    });
    
    mockSocket.on('user_left', (data) => {
      setActiveUsers(data.activeUsers);
    });
    
    // Join form
    mockSocket.emit('join_form', {
      formId: form.id,
      userId: user?.id || 'anonymous',
      username: user?.username || 'Anonymous User'
    });
    
    return () => {
      mockSocket.disconnect();
    };
  }, [form.id, user]);
  
  const handleFieldChange = (fieldName, value) => {
    // Update local state immediately (optimistic update)
    setResponse(prev => ({ ...prev, [fieldName]: value }));
    
    // Emit to socket
    if (socket) {
      socket.emit('field_update', {
        formId: form.id,
        fieldName,
        value,
        userId: user?.id || 'anonymous'
      });
    }
    
    // Debounced save
    setSaving(true);
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    updateTimeoutRef.current = setTimeout(() => {
      setSaving(false);
    }, 1000);
  };
  
  const handleFieldFocus = (fieldName) => {
    if (socket && !locks[fieldName]) {
      socket.emit('field_lock', {
        formId: form.id,
        fieldName,
        userId: user?.id || 'anonymous'
      });
    }
  };
  
  const handleFieldBlur = (fieldName) => {
    if (socket && locks[fieldName] === (user?.id || 'anonymous')) {
      socket.emit('field_unlock', {
        formId: form.id,
        fieldName,
        userId: user?.id || 'anonymous'
      });
    }
  };
  
  const renderField = (field) => {
    const isLocked = locks[field.name] && locks[field.name] !== (user?.id || 'anonymous');
    const lockOwner = locks[field.name];
    
    const fieldProps = {
      id: field.name,
      value: response[field.name] || '',
      onChange: (e) => handleFieldChange(field.name, e.target.value),
      onFocus: () => handleFieldFocus(field.name),
      onBlur: () => handleFieldBlur(field.name),
      disabled: isLocked,
      className: `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
        isLocked ? 'bg-red-50 border-red-300' : 'border-gray-300'
      } ${locks[field.name] === (user?.id || 'anonymous') ? 'ring-2 ring-blue-200' : ''}`
    };
    
    return (
      <div key={field.name} className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {isLocked && (
            <div className="flex items-center text-red-600 text-sm">
              <Lock size={14} className="mr-1" />
              Editing...
            </div>
          )}
          {locks[field.name] === (user?.id || 'anonymous') && (
            <div className="flex items-center text-blue-600 text-sm">
              <Unlock size={14} className="mr-1" />
              You're editing
            </div>
          )}
        </div>
        
        {field.type === 'textarea' ? (
          <textarea {...fieldProps} rows={4} />
        ) : field.type === 'dropdown' ? (
          <select {...fieldProps}>
            <option value="">Select an option</option>
            {field.options?.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input {...fieldProps} type={field.type} />
        )}
      </div>
    );
  };
  
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-xl shadow-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={onBack}
                className="text-blue-600 hover:text-blue-800 mb-2"
              >
                ← Back to Forms
              </button>
              <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
              {form.description && (
                <p className="text-gray-600 mt-1">{form.description}</p>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {saving && (
                <div className="flex items-center text-blue-600 text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Saving...
                </div>
              )}
              
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users size={16} />
                <span>{activeUsers} active user{activeUsers !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle size={16} />
                <span>Auto-save enabled</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="space-y-6">
            {form.fields?.map(renderField)}
          </div>
          
          {form.fields?.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No fields in this form yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Dashboard Component
const Dashboard = () => {
  const [forms, setForms] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [currentForm, setCurrentForm] = useState(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [copied, setCopied] = useState(null);
  const { user, token, logout } = useAuth();
  
  useEffect(() => {
    if (user?.role === 'admin') {
      loadForms();
    }
  }, [user, token]);
  
  const loadForms = async () => {
    try {
      const userForms = await apiService.getForms(token);
      setForms(Array.isArray(userForms) ? userForms : []);
    } catch (error) {
      console.error('Error loading forms:', error);
      setForms([]);
    }
  };
  
  const handleJoinForm = async (code) => {
    try {
      const result = await apiService.joinForm(code || joinCode);
      if (result.form) {
        setCurrentForm({ ...result.form, response: result.response });
        setShowJoinForm(false);
        setJoinCode('');
      }
    } catch (error) {
      console.error('Error joining form:', error);
    }
  };
  
  const copyShareCode = (shareCode) => {
    navigator.clipboard.writeText(shareCode);
    setCopied(shareCode);
    setTimeout(() => setCopied(null), 2000);
  };
  
  if (currentForm) {
    return (
      <CollaborativeForm
        form={currentForm}
        onBack={() => setCurrentForm(null)}
      />
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Collaborative Forms</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Welcome, {user?.username} ({user?.role})
              </span>
              <button
                onClick={logout}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {user?.role === 'admin' && (
              <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">My Forms</h2>
                  <FormBuilder onFormCreated={(form) => {
                    setForms([...forms, form]);
                  }} />
                </div>
                
                {forms.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Settings size={48} className="mx-auto mb-4 text-gray-400" />
                    <p>No forms created yet. Create your first form to get started!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {forms.map((form) => (
                      <div key={form.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="font-medium text-gray-900">{form.title}</h3>
                            {form.description && (
                              <p className="text-sm text-gray-600 mt-1">{form.description}</p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Users size={14} />
                                {form.activeUsers || 0} active
                              </span>
                              <span className="flex items-center gap-1">
                                <Eye size={14} />
                                {form.responseCount || 0} responses
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1">
                              <code className="text-sm font-mono">{form.shareCode}</code>
                              <button
                                onClick={() => copyShareCode(form.shareCode)}
                                className="text-gray-500 hover:text-gray-700"
                              >
                                {copied === form.shareCode ? (
                                  <CheckCircle size={16} className="text-green-600" />
                                ) : (
                                  <Copy size={16} />
                                )}
                              </button>
                            </div>
                            
                            <button
                              onClick={() => handleJoinForm(form.shareCode)}
                              className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <Share2 size={16} />
                              Open
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div>
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Join a Form</h3>
              
              {!showJoinForm ? (
                <button
                  onClick={() => setShowJoinForm(true)}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Join Form by Code
                </button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Form Code
                    </label>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter form code"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleJoinForm()}
                      disabled={!joinCode.trim()}
                      className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                      Join Form
                    </button>
                    <button
                      onClick={() => {
                        setShowJoinForm(false);
                        setJoinCode('');
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Get a form code from an admin</li>
                  <li>• Enter the code above to join</li>
                  <li>• Collaborate in real-time with others</li>
                  <li>• See live updates as others type</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main App Component
const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  return (
    <AuthProvider>
      <div className="App">
        <AuthWrapper onAuthChange={setIsAuthenticated} />
      </div>
    </AuthProvider>
  );
};

const AuthWrapper = ({ onAuthChange }) => {
  const { user, token } = useAuth();
  
  useEffect(() => {
    onAuthChange(!!user && !!token);
  }, [user, token, onAuthChange]);
  
  if (!user || !token) {
    return <LoginForm onSuccess={() => onAuthChange(true)} />;
  }
  
  return <Dashboard />;
};

export default App;