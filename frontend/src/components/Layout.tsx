import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/live-monitor', label: 'Live Monitor' },
  { to: '/upload', label: 'Upload & Analyze' },
  { to: '/history', label: 'Session History' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      <nav className="w-56 bg-white border-r border-gray-200 flex flex-col px-4 py-6 gap-1">
        <span className="text-xl font-bold text-gray-900 mb-6 px-2">Rayovak</span>
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  )
}
