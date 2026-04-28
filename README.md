Flow Guru Web: Architectural Overview

This document provides a comprehensive architectural overview of the flow-guru-web repository, analyzing its structure, technology stack, and core design patterns.

1. High-Level Architecture

The flow-guru-web project is a modern, full-stack web application built with a clear separation of concerns between the client and server, yet unified within a single repository structure. It leverages a robust set of technologies designed for scalability, type safety, and rapid development.

The architecture follows a typical client-server model:

•
Client: A React-based Single Page Application (SPA) built with Vite.

•
Server: A Node.js backend utilizing Express and tRPC for API communication.

•
Database: A relational database (likely PostgreSQL or MySQL, given the use of Drizzle ORM and mysqlTable in the schema) managed via Drizzle ORM.

2. Technology Stack

The project employs a modern and cohesive technology stack:

Component
Technology
Description
Frontend Framework
React 19
The core UI library for building the user interface.
Build Tool
Vite
A fast frontend build tool that significantly improves the development experience.
Routing
Wouter
A minimalist routing solution for React, chosen over heavier alternatives like React Router.
Styling
Tailwind CSS
A utility-first CSS framework for rapid UI development, complemented by framer-motion for animations and tailwindcss-animate.
UI Components
Radix UI
Unstyled, accessible components used as the foundation for the design system (likely integrated via shadcn/ui given the components.json and Radix dependencies).
Backend Framework
Express
A minimal and flexible Node.js web application framework.
API Layer
tRPC
Enables end-to-end typesafe APIs without the need for code generation or runtime bloat.
Database ORM
Drizzle ORM
A lightweight, type-safe TypeScript ORM used for database interactions and schema management.
Language
TypeScript
Used extensively across both client and server for strict type safety.
Package Manager
pnpm
A fast, disk space-efficient package manager.




3. Project Structure

The repository is organized into several key directories, reflecting its full-stack nature:

•
client/: Contains the frontend React application.

•
src/components/: Reusable UI components.

•
src/pages/: Top-level route components (e.g., Home, Calendar, Lists, Settings).

•
src/contexts/: React contexts for global state management (e.g., ThemeContext, LanguageContext).

•
src/lib/: Utility functions and helpers.

•
src/hooks/: Custom React hooks.



•
server/: Contains the backend Node.js application.

•
routers.ts: Defines the tRPC routers and API endpoints.

•
db.ts: Database connection and query logic.

•
assistantActions.ts: Logic related to AI assistant capabilities and tool execution.

•
_core/: Core server setup and configuration.



•
db/: Contains raw SQL schema definitions (schema.sql).

•
drizzle/: Contains Drizzle ORM specific files.

•
schema.ts: The TypeScript definition of the database schema.

•
migrations/: Database migration files.



•
shared/: Code shared between the client and server (e.g., constants, types).

•
api/: Contains serverless function handlers, likely for deployment on platforms like Vercel (indicated by vercel.json).

4. Core Systems and Features

Based on the codebase analysis, several core systems are prominent:

4.1. Authentication and User Management

The system includes a robust user management system. The database schema (users table) indicates support for OAuth (specifically mentioning "Manus OAuth identifier"), role-based access control (user/admin), and tracking of user sessions.

4.2. AI Assistant Integration

A significant portion of the backend logic is dedicated to an AI assistant ("FLO GURU"). The routers.ts file reveals a sophisticated setup for handling conversational threads, managing user memory profiles, and executing specific tools.
The assistant is equipped with tools such as:

•
playMusic: For music playback based on genre or mood.

•
createCalendarEvent: For scheduling events.

•
getWeather: For retrieving weather information.

•
setReminder: For setting user reminders.

•
manageList: For managing personal lists (e.g., Grocery, Todo).

4.3. Memory and Context Management

The application features a "User Memory Profile" system. It extracts and stores facts about the user (e.g., wake-up time, daily routine, preferences) from conversations to provide a personalized experience. This is managed through tables like userMemoryProfiles and userMemoryFacts.

4.4. Third-Party Integrations

The schema includes a providerConnections table, indicating support for integrating with external services such as Google Calendar and Spotify. This allows the assistant to interact with these platforms on behalf of the user.

5. Deployment and Operations

The presence of vercel.json suggests that the application is designed to be deployed on Vercel, taking advantage of its serverless functions and edge network capabilities. The docker-compose.yml file indicates that the project can also be run locally or deployed using Docker containers, providing flexibility in hosting options.

The build process, defined in package.json, utilizes vite build for the frontend and esbuild for bundling the Node.js server, ensuring optimized assets for production.

Conclusion

The flow-guru-web repository represents a well-structured, modern web application. Its use of tRPC for end-to-end type safety, combined with a powerful AI assistant backend and a polished React frontend, demonstrates a sophisticated approach to building interactive and intelligent web experiences. The architecture is designed to be scalable and maintainable, leveraging current best practices in the TypeScript ecosystem.

