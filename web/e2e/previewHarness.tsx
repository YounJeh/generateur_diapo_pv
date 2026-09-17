import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Step3Result } from '../src/steps/Step3Result';
import '../src/styles/global.css';

const root = createRoot(document.getElementById('root')!);
const file = new URLSearchParams(location.search).get('file') ?? '/presentation.pptx';
root.render(<StrictMode><Step3Result result={{ pptxUrl: file }}
  onStartOver={() => root.render(<p>Nouvelle présentation</p>)} /></StrictMode>);
