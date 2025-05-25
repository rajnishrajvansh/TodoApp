import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, Save, Loader, MessageSquare } from 'lucide-react';
import './App.css';

const FIREBASE_URL = import.meta.env.VITE_FIREBASE_URL;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const SLACK_WEBHOOK_URL = import.meta.env.VITE_SLACK_WEBHOOK_URL;

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

const SlackService = {
  async sendSummary(summary, todos) {
    if (!SLACK_WEBHOOK_URL || SLACK_WEBHOOK_URL === 'https://hooks.slack.com/services/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') {
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
