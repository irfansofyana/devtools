# Contributing to Devtools

Thank you for your interest in contributing to Devtools! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Development Environment Setup](#development-environment-setup)
  - [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
  - [Task Management](#task-management)
  - [Branching Strategy](#branching-strategy)
  - [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
  - [Creating a Pull Request](#creating-a-pull-request)
  - [Code Review Process](#code-review-process)
- [Coding Standards](#coding-standards)
  - [JavaScript Guidelines](#javascript-guidelines)
  - [CSS Guidelines](#css-guidelines)
  - [Testing Guidelines](#testing-guidelines)
- [Adding a New Tool](#adding-a-new-tool)
- [Documentation](#documentation)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

### Development Environment Setup

1. **Fork the Repository**
   - Click the "Fork" button at the top right of the repository page

2. **Clone Your Fork**

   ```bash
   git clone https://github.com/irfansofyana/devtools.git
   cd devtools
   ```

3. **Set Up Remote**

   ```bash
   git remote add upstream https://github.com/irfansofyana/devtools.git
   ```

4. **Open the Project**

   Open the project in your favorite code editor and you're ready to start contributing.

### Project Structure

Familiarize yourself with the project structure:

```plaintext
devtools/
├── assets/            # Static assets (images, icons, etc.)
├── css/               # Stylesheet files
├── js/                # JavaScript files
│   ├── tools/         # Individual tool implementations
│   ├── utils/         # Utility functions
│   └── app.js         # Main application script
├── index.html         # Main HTML entry point
├── .gitignore         # Git ignore file
├── CONTRIBUTING.md    # This file
├── LICENSE            # MIT License
└── README.md          # Project documentation
```

## Development Workflow

### Task Management

We use GitHub Issues to track tasks, bugs, and feature requests. If you're looking to contribute but don't know where to start:

1. Check the "good first issue" label for beginner-friendly tasks
2. Look at open issues that need assistance
3. Propose a new feature or report a bug by creating a new issue

### Branching Strategy

We follow a simplified Git workflow:

1. **Main Branch**: Production-ready code
2. **Feature Branches**: Created for new features or bug fixes

Always create a new branch from the latest `main`:

```bash
git checkout main
git pull upstream main
git checkout -b feature/your-feature-name
```

### Commit Guidelines

We follow conventional commits for clear and structured commit messages:

- `feat:` - A new feature
- `fix:` - A bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code changes that neither fix bugs nor add features
- `test:` - Adding or updating tests
- `chore:` - Changes to the build process or auxiliary tools

Example:

```text
feat: add JWT expiration visualization
```

## Pull Request Process

### Creating a Pull Request

1. Ensure your code follows our coding standards
2. Update documentation as necessary
3. Add tests for new functionality
4. Make sure all tests pass
5. Push your branch to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a pull request from your fork to the main repository
7. Fill out the PR template with all required information

### Code Review Process

All submissions require review before being merged:

1. At least one maintainer must approve your PR
2. Address any requested changes promptly
3. Once approved, a maintainer will merge your PR

## Coding Standards

### JavaScript Guidelines

- Use modern ES6+ syntax
- Follow best practices for vanilla JavaScript
- Keep functions small and focused on a single task
- Use meaningful variable and function names
- Comment complex logic
- Follow the project's existing patterns

### CSS Guidelines

- Use the BEM (Block Element Modifier) naming convention
- Keep selectors as simple as possible
- Use variables for colors, spacing, etc.
- Ensure responsive design works on all screen sizes

### Testing Guidelines

- Write unit tests for new functionality
- Ensure tests are meaningful and not just for coverage
- Test edge cases and error handling
- Test your changes thoroughly in multiple browsers before submitting a PR

## Adding a New Tool

To add a new tool to the collection:

1. Create a new file in `js/tools/your-tool-name.js`
2. Implement the tool following the existing patterns
3. Add the tool to the navigation menu in `index.html`
4. Update the README.md to include your tool in the list
5. Test your tool thoroughly in multiple browsers
6. Document usage in comments

## Documentation

Good documentation is crucial:

- Update the README.md when adding new features
- Add JSDoc comments to functions and components
- Create or update usage examples
- Document any configuration options

## Community

Join our community:

- Star the repository
- Watch for updates
- Participate in discussions in issues and pull requests
- Help others with their questions

Thank you for contributing to Devtools!
