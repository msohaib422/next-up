import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {/* min-w-0 lets the content column shrink inside the flex/grid tracks it
          lives in, so a wide child (a table, a long link) is contained by its
          own section instead of pushing the whole page sideways. */}
      <div className="lg:ml-64 min-w-0">
        <Header onMenuToggle={() => setSidebarOpen(true)} />
        <main className="p-4 lg:p-6 min-w-0 max-w-full">
          {children}
        </main>
      </div>
    </div>
  )
}
