import { useAuth } from '../../context/AuthContext'

/** Shared, subtle provenance metadata for published contribution previews. */
export default function ContributorAttribution({ contributor }) {
  const { user } = useAuth()
  const contributorId = contributor?._id || contributor?.id || contributor
  const contributorName = typeof contributor === 'object' ? contributor?.name : ''

  if (!contributorId || !contributorName) return null

  const isCurrentUser = user?._id && String(user._id) === String(contributorId)
  return (
    <p className="mb-5 text-left text-sm font-medium text-gray-500 dark:text-gray-400">
      Contributed by: <span className="text-gray-700 dark:text-gray-200">{isCurrentUser ? 'You' : contributorName}</span>
    </p>
  )
}
