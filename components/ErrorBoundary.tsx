import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// Last line of defense: without this, any unhandled render-time exception
// (e.g. a backend endpoint returning an error object where the UI expected
// an array) unmounts the entire React tree, leaving only the dark theme's
// near-black body background visible — a blank screen with no indication
// anything went wrong.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
          <div className="text-center max-w-[360px]">
            <p className="text-[15px] font-semibold text-white mb-2">Что-то пошло не так</p>
            <p className="text-[13px] text-[#9a9a9a] mb-6">
              Попробуйте обновить страницу. Если ошибка повторяется, сообщите в поддержку.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#3d9eff] text-white rounded-lg text-[13px] font-medium touch-manipulation"
            >
              Обновить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
