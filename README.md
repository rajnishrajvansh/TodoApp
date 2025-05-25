![Todo UI](assets/todoui.jpg)

# TodoStart

A simple Todo application built with a focus on clean architecture and intuitive user experience.

## Features

- Add, edit, and delete tasks
- Mark tasks as completed
- Filter tasks by status
- Responsive and user-friendly interface

## Getting Started

1. Clone the repository:
    ```bash
    git clone https://github.com/yourusername/TodoStart.git
    ```
2. Navigate to the project directory:
    ```bash
    cd TodoStart
    ```
3. Install dependencies:
    ```bash
    npm install
    ```
4. Start the development server:
    ```bash
    npm start
    ```

## Folder Structure

```
/assets         # Images and static files
/src            # Application source code
  /components   # UI components
  /pages        # Page components
  /utils        # Utility functions
```    

## Slack & OpenAI Setup

### Slack Integration

To enable Slack notifications for task updates:

1. Create a Slack App at [Slack API](https://api.slack.com/apps).
2. Add the necessary permissions (e.g., `chat:write`).
3. Install the app to your workspace and copy the Bot User OAuth Token.
4. Set the token in your environment variables:
    ```bash
    SLACK_BOT_TOKEN=your-slack-bot-token
    ```
5. Configure the webhook or use the Slack SDK in your codebase to send notifications.

### OpenAI Integration

To use OpenAI for smart suggestions or task summaries:

1. Sign up at [OpenAI](https://platform.openai.com/) and obtain your API key.
2. Add your API key to your environment variables:
    ```bash
    OPENAI_API_KEY=your-openai-api-key
    ```
3. Use the OpenAI SDK or REST API in your application to access AI features.

## Design & Architecture Decisions

- **Clean Architecture:** The project separates concerns by organizing code into components, pages, and utilities, making it scalable and maintainable.
- **Component-Based UI:** Reusable React components are used for consistency and easier testing.
- **State Management:** Local state is managed within components; for larger apps, consider integrating a state management library.
- **API Integration:** External services like Slack and OpenAI are abstracted into utility modules for easy replacement or extension.
- **Responsiveness:** The UI is designed to be mobile-friendly and accessible.
- **Testing:** The structure supports adding unit and integration tests for reliability.