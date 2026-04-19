import { PopoverContent } from './PopoverContent';
import './App.css';

function App() {
  const browserPreview = typeof window !== 'undefined' && !('__TAURI_INTERNALS__' in window);
  return (
    <div
      style={{
        background: browserPreview
          ? 'radial-gradient(ellipse at top right, #F4C79A 0%, #DE8E60 30%, #8B4A2E 70%, #3A1E12 100%)'
          : 'transparent',
      }}
    >
      <PopoverContent />
    </div>
  );
}

export default App;
