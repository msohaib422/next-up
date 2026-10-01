import { Check } from 'lucide-react'

/**
 * The personal "I have done this" tick, for the top-right corner of a card.
 *
 * It records what ONE user has finished. It is not the item's status badge and
 * it is not part of the card's own click, so it needs the card to be the
 * positioning context (`relative` on the card) and the card's padding to stay as
 * it is - the tick takes up no room in the layout.
 *
 * HALF IN, HALF OUT: the box is anchored to the card's corner and pulled out by
 * half its own size in each direction, so the card keeps its full width and the
 * tick sits on the corner rather than on top of the content. The anchoring is
 * offset by the card's 1px border because an absolutely positioned child is
 * placed against the card's padding box, not its outside edge - without that the
 * box would sit a pixel inside the corner instead of on it. The hit area is a
 * little larger than the drawn box, so it is comfortable to click and tap
 * without moving anything.
 */
export default function CompletionTick({ checked, onToggle, itemTitle = '' }) {
  const what = itemTitle ? `"${itemTitle}"` : 'this item'

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `${what}: marked as completed` : `Mark ${what} as completed`}
      title={checked ? 'Completed' : 'Mark as completed'}
      onClick={(e) => {
        // The whole card is clickable (it opens the item), so the tick takes its
        // own click and leaves the card's alone.
        e.stopPropagation()
        onToggle()
      }}
      className="absolute -top-px -right-px z-10 flex h-[26px] w-[26px] translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <span
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 transition-colors ${
          checked
            ? 'border-green-500 bg-green-500 text-white dark:border-green-400 dark:bg-green-400'
            : 'border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
        }`}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
    </button>
  )
}