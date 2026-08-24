# ZORVEX ERP Frontend Foundation (Phase 8H)

This is the new React/Vite SPA frontend foundation for ZORVEX ERP, running alongside the legacy Django MPA templates.

## ⚠️ Important Note
**Phase 8H-2 does not replace the existing Django frontend.**
The original login (`/login/`) and module pages (`/pos/`, `/inventory/`, etc.) remain in place and operational. 
This React application consumes existing JWT tokens from `localStorage` provided by the original `login.js`.

## Architecture
- **Framework:** React 18, TypeScript, Vite
- **Routing:** React Router v6
- **State Management:** Zustand
- **API Client:** Axios (with centralized JWT interceptors)
- **Styling:** CSS variables based foundation

## Installation

```bash
cd frontend
npm install
```

## Environment Variables
Copy `.env.example` to `.env.local` and set the backend URL:

```
VITE_API_BASE_URL=http://localhost:8000
```

## Development
```bash
npm run dev
```

## Build for Production
```bash
npm run build
```

## Folder Structure
- `src/api` - Centralized Axios client and request types
- `src/auth` - Token management and Zustand auth store
- `src/router` - React Router configuration and route protection
- `src/layouts` - Structural layouts (AppLayout)
- `src/pages` - Page components
- `src/components` - Reusable UI components (future phases)
- `src/styles` - CSS variables and global styles
