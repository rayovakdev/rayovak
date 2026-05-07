import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import LiveMonitor from './pages/LiveMonitor'
import UploadAnalyze from './pages/UploadAnalyze'
import SessionHistory from './pages/SessionHistory'
import Settings from './pages/Settings'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="live-monitor" element={<LiveMonitor />} />
        <Route path="upload" element={<UploadAnalyze />} />
        <Route path="history" element={<SessionHistory />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
