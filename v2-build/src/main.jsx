import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider } from './context/AppContext';
import LavamexPOS from './App';
import './index.css';

const root = createRoot(document.getElementById('root'));
root.render(
    <AppProvider>
        <LavamexPOS />
    </AppProvider>
);
