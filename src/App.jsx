import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, Save, Loader, MessageSquare } from 'lucide-react';

// Firebase configuration (replace with your config)
const FIREBASE_URL = 'https://firestore.googleapis.com/v1/projects/todo-app-d0bac/databases/(default)/documents/TodoTable';

// Configuration - Replace with your actual API keys and webhook URL
const OPENAI_API_KEY = 'your-openai-api-key-here'; // Replace with your OpenAI API key
const SLACK_WEBHOOK_URL = 'your-slack-webhook-url-here'; // Replace with your Slack webhook URL

// OpenAI Service
const OpenAIService = {
  async summarizeTodos(todos) {
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your-openai-api-key-here') {
      throw new Error('OpenAI API key not configured');
    }

    const completedTodos = todos.filter(todo => todo.completed);
    const pendingTodos = todos.filter(todo => !todo.completed);
    
    const todoText = todos.map(todo => 
      `- ${todo.text} (${todo.completed ? 'completed' : 'pending'})`
    ).join('\n');

    const prompt = `Please provide a concise and insightful summary of this todo list. Include:
1. Overall progress assessment
2. Key themes or categories of tasks
3. Priority recommendations
4. Brief motivational insight

Todo List:
${todoText}

Statistics:
- Total tasks: ${todos.length}
- Completed: ${completedTodos.length}
- Pending: ${pendingTodos.length}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a helpful productivity assistant that provides concise, actionable summaries of todo lists.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw error;
    }
  }
};

// Slack Service
const SlackService = {
  async sendSummary(summary, todos) {
    if (!SLACK_WEBHOOK_URL || SLACK_WEBHOOK_URL === 'your-slack-webhook-url-here') {
      throw new Error('Slack webhook URL not configured');
    }

    const completedCount = todos.filter(todo => todo.completed).length;
    const totalCount = todos.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const message = {
      text: "📋 Todo List Summary",
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📋 Todo List Summary"
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Total Tasks:* ${totalCount}`
            },
            {
              type: "mrkdwn",
              text: `*Completed:* ${completedCount}`
            },
            {
              type: "mrkdwn",
              text: `*Pending:* ${totalCount - completedCount}`
            },
            {
              type: "mrkdwn",
              text: `*Progress:* ${completionRate}%`
            }
          ]
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*AI Summary:*\n${summary}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Generated on ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    };

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook error: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Error sending to Slack:', error);
      throw error;
    }
  }
};

const FirebaseService = {
  initialized: false,

  async initialize() {
    // No actual init needed for REST call in test mode
    console.log('Firestore REST API connected');
    this.initialized = true;
  },

  async getTodos() {
    console.log("Fetching todos from Firestore");
    try {
      const response = await fetch(FIREBASE_URL);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const json = await response.json();
      console.log("Todos fetched:", json);

      // Transform Firestore format to app format
      const todos = (json.documents || []).map(doc => {
        const id = doc.name.split('/').pop();
        const fields = doc.fields;

        if (!fields || !fields.text) {
          console.warn('Skipping invalid document:', doc);
          return null;
        }

        return {
          id,
          text: fields.text.stringValue,
          completed: fields.completed?.booleanValue || false,
          createdAt: fields.createdAt?.stringValue || null,
          updatedAt: fields.updatedAt?.stringValue || null,
        };
      }).filter(Boolean);

      console.log("Transformed todos:", todos);
      return todos;
    } catch (error) {
      console.error('Error fetching todos:', error);
      return [];
    }
  },

  async addTodo(todo) {
    console.log("Adding todo to Firestore:", todo);
    try {
      const response = await fetch(FIREBASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            text: { stringValue: todo.text },
            completed: { booleanValue: todo.completed },
            createdAt: { stringValue: todo.createdAt },
            updatedAt: { stringValue: todo.updatedAt }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newDoc = await response.json();
      const id = newDoc.name.split('/').pop();

      return { ...todo, id };
    } catch (error) {
      console.error('Error adding todo:', error);
      throw error;
    }
  },

  async updateTodo(id, updates) {
    console.log("Updating todo in Firestore:", id, updates);
    try {
      const updateUrl = `${FIREBASE_URL}/${id}?updateMask.fieldPaths=text&updateMask.fieldPaths=completed&updateMask.fieldPaths=updatedAt`;
      const response = await fetch(updateUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            ...(updates.text && { text: { stringValue: updates.text } }),
            ...(updates.completed !== undefined && { completed: { booleanValue: updates.completed } }),
            updatedAt: { stringValue: updates.updatedAt }
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedDoc = await response.json();
      return {
        id,
        text: updatedDoc.fields?.text?.stringValue || '',
        completed: updatedDoc.fields?.completed?.booleanValue || false,
        updatedAt: updatedDoc.fields?.updatedAt?.stringValue || ''
      };
    } catch (error) {
      console.error('Error updating todo:', error);
      throw error;
    }
  },

  async deleteTodo(id) {
    console.log("Deleting todo from Firestore:", id);
    try {
      const deleteUrl = `${FIREBASE_URL}/${id}`;
      const response = await fetch(deleteUrl, { method: 'DELETE' });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error deleting todo:', error);
      throw error;
    }
  }
};


export default function TodoApp() {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  // Initialize Firebase and load todos
  useEffect(() => {
    const initializeApp = async () => {
      try {
        await FirebaseService.initialize();
        await loadTodos();
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeApp();
  }, []);

  // Load todos from Firebase
  const loadTodos = async () => {
    try {
      const todosData = await FirebaseService.getTodos();
      setTodos(todosData);
    } catch (error) {
      console.error('Error loading todos:', error);
      setTodos([]); // Set empty array on error
    }
  };

  // Add new todo
  const addTodo = async () => {
    if (inputValue.trim() !== '') {
      setSaving(true);
      try {
        const newTodo = {
          text: inputValue.trim(),
          completed: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        const savedTodo = await FirebaseService.addTodo(newTodo);
        setTodos([...todos, savedTodo]);
        setInputValue('');
      } catch (error) {
        console.error('Error adding todo:', error);
        alert('Failed to add todo. Please try again.');
      } finally {
        setSaving(false);
      }
    }
  };

  // Delete todo
  const deleteTodo = async (id) => {
    setSaving(true);
    try {
      await FirebaseService.deleteTodo(id);
      setTodos(todos.filter(todo => todo.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditValue('');
      }
    } catch (error) {
      console.error('Error deleting todo:', error);
      alert('Failed to delete todo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle completion status
  const toggleComplete = async (id) => {
    setSaving(true);
    try {
      const todo = todos.find(t => t.id === id);
      const updates = {
        completed: !todo.completed,
        updatedAt: new Date().toISOString()
      };
      
      await FirebaseService.updateTodo(id, updates);
      setTodos(todos.map(todo =>
        todo.id === id ? { ...todo, ...updates } : todo
      ));
    } catch (error) {
      console.error('Error updating todo:', error);
      alert('Failed to update todo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Start editing
  const startEdit = (id, currentText) => {
    setEditingId(id);
    setEditValue(currentText);
  };

  // Save edit
  const saveEdit = async (id) => {
    if (editValue.trim() !== '') {
      setSaving(true);
      try {
        const updates = {
          text: editValue.trim(),
          updatedAt: new Date().toISOString()
        };
        
        await FirebaseService.updateTodo(id, updates);
        setTodos(todos.map(todo =>
          todo.id === id ? { ...todo, ...updates } : todo
        ));
      } catch (error) {
        console.error('Error updating todo:', error);
        alert('Failed to update todo. Please try again.');
      } finally {
        setSaving(false);
      }
    }
    setEditingId(null);
    setEditValue('');
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  // Handle keyboard events
  const handleAddKeyPress = (e) => {
    if (e.key === 'Enter' && !saving) {
      addTodo();
    }
  };

  const handleEditKeyPress = (e, id) => {
    if (e.key === 'Enter') {
      saveEdit(id);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Summarize and send to Slack
  const summarizeAndSend = async () => {
    if (todos.length === 0) {
      alert('No todos to summarize!');
      return;
    }

    setSummarizing(true);
    try {
      // Generate summary using OpenAI
      const summary = await OpenAIService.summarizeTodos(todos);
      
      // Send to Slack
      await SlackService.sendSummary(summary, todos);
      
      alert('Summary sent to Slack successfully! 🎉');
    } catch (error) {
      console.error('Error summarizing and sending:', error);
      
      let errorMessage = 'Failed to generate summary and send to Slack.';
      if (error.message.includes('OpenAI API key')) {
        errorMessage = 'Please configure your OpenAI API key in the code.';
      } else if (error.message.includes('Slack webhook')) {
        errorMessage = 'Please configure your Slack webhook URL in the code.';
      } else if (error.message.includes('OpenAI API error')) {
        errorMessage = 'OpenAI API error. Please check your API key and try again.';
      }
      
      alert(errorMessage);
    } finally {
      setSummarizing(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const completedCount = todos.filter(todo => todo.completed).length;
  const totalCount = todos.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="animate-spin mx-auto mb-4 text-blue-500" size={32} />
          <p className="text-gray-600">Loading your todos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Firebase Todo List</h1>
          <p className="text-gray-600">Cloud-synced tasks that persist everywhere</p>
          {saving && (
            <div className="flex items-center justify-center gap-2 mt-2 text-blue-600">
              <Loader className="animate-spin" size={16} />
              <span className="text-sm">Syncing...</span>
            </div>
          )}
        </div>

        {/* Add todo section */}
        <div className="mb-8">
          <div className="flex gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleAddKeyPress}
              placeholder="What needs to be done?"
              disabled={saving}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800 disabled:opacity-50"
            />
            <button
              onClick={addTodo}
              disabled={!inputValue.trim() || saving}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? <Loader className="animate-spin" size={20} /> : <Plus size={20} />}
              Add Task
            </button>
          </div>
        </div>

        {/* Summarize button */}
        {todos.length > 0 && (
          <div className="mb-6 text-center">
            <button
              onClick={summarizeAndSend}
              disabled={summarizing || saving}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
            >
              {summarizing ? (
                <>
                  <Loader className="animate-spin" size={20} />
                  Generating Summary...
                </>
              ) : (
                <>
                  <MessageSquare size={20} />
                  Summarize & Send to Slack
                </>
              )}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Uses AI to analyze your todos and sends insights to Slack
            </p>
          </div>
        )}

        {/* Stats */}
        {totalCount > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">
                Total: <span className="font-semibold text-gray-800">{totalCount}</span> tasks
              </span>
              <span className="text-gray-600">
                Completed: <span className="font-semibold text-green-600">{completedCount}</span>
              </span>
              <span className="text-gray-600">
                Remaining: <span className="font-semibold text-blue-600">{totalCount - completedCount}</span>
              </span>
            </div>
            {totalCount > 0 && (
              <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(completedCount / totalCount) * 100}%` }}
                ></div>
              </div>
            )}
          </div>
        )}

        {/* Todo list */}
        <div className="space-y-3">
          {todos.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks yet</h3>
              <p className="text-gray-500">Add your first task above to get started!</p>
            </div>
          ) : (
            todos.map((todo) => (
              <div
                key={todo.id}
                className={`flex items-center gap-3 p-4 border rounded-lg transition-all ${
                  todo.completed
                    ? 'bg-gray-50 border-gray-200'
                    : 'bg-white border-gray-300 hover:border-gray-400 hover:shadow-sm'
                } ${saving ? 'opacity-75' : ''}`}
              >
                {/* Completion checkbox */}
                <button
                  onClick={() => toggleComplete(todo.id)}
                  disabled={saving}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all disabled:opacity-50 ${
                    todo.completed
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300 hover:border-green-400'
                  }`}
                >
                  {todo.completed && <Check size={14} />}
                </button>

                {/* Todo content */}
                <div className="flex-1 min-w-0">
                  {editingId === todo.id ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyPress={(e) => handleEditKeyPress(e, todo.id)}
                      onBlur={() => saveEdit(todo.id)}
                      disabled={saving}
                      className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      autoFocus
                    />
                  ) : (
                    <div>
                      <span
                        className={`block text-lg ${
                          todo.completed
                            ? 'text-gray-500 line-through'
                            : 'text-gray-800'
                        }`}
                      >
                        {todo.text}
                      </span>
                      <span className="text-xs text-gray-400">
                        Created: {formatDate(todo.createdAt)}
                        {todo.updatedAt !== todo.createdAt && (
                          <span> • Updated: {formatDate(todo.updatedAt)}</span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {editingId === todo.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(todo.id)}
                        disabled={saving}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-full transition-colors disabled:opacity-50"
                        title="Save"
                      >
                        <Save size={16} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={saving}
                        className="p-2 text-gray-500 hover:bg-gray-50 rounded-full transition-colors disabled:opacity-50"
                        title="Cancel"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(todo.id, todo.text)}
                        disabled={saving}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors disabled:opacity-50"
                        title="Edit"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        disabled={saving}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-500">
            ☁️ Your todos are automatically synced to Firebase
          </p>
          {todos.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              Click checkmark to complete, edit icon to modify, or trash to delete
            </p>
          )}
        </div>
      </div>
    </div>
  );
}