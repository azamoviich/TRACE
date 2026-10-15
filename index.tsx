import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/rd/tokens.css';
import './styles/rd/shell.css';
import './styles/rd/dash.css';
import './styles/rd/sales.css';
import './styles/rd/ops.css';
import './styles/rd/fin.css';
import './styles/rd/staff.css';
import './styles/rd/plan.css';
import './styles/rd/reviews.css';
import './styles/rd/app.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);