import { Suspense, useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import LoadingSpinner from '../ui/LoadingSpinner'

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
          {/*
            The page boundary lives here, around the page only - never around
            the shell. A page is downloaded on demand, and while it is being
            downloaded this boundary holds the content column steady while the
            sidebar and the header stay exactly where they were.

            When the boundary sat above the routes instead, React replaced the
            whole application with a full-screen spinner for the duration of
            the download, and every sidebar navigation looked like the site
            was reloading. The placeholder below is the same one a page shows
            itself while its own data loads, and it appears inside the content
            column, where a pending page belongs.
          */}
          <Suspense fallback={<LoadingSpinner />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  )
}
