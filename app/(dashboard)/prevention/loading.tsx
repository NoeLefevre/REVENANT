export default function PreventionLoading() {
  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="skeleton h-7 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg p-5 flex flex-col gap-2"
            style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
          >
            <div className="skeleton h-3 w-28 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-8 w-12 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          </div>
        ))}
      </div>

      {/* Expiring cards section */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        <div className="px-4 py-3 border-b border-[#E5E7EB] flex flex-col gap-1">
          <div className="skeleton h-4 w-36 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          <div className="skeleton h-3 w-56 rounded" style={{ backgroundColor: '#E5E7EB' }} />
        </div>
        <div className="h-9 px-4" style={{ backgroundColor: '#F7F5F2', borderBottom: '1px solid #E5E7EB' }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 px-4 flex items-center gap-4 border-b border-[#E5E7EB] last:border-b-0">
            <div className="flex flex-col gap-1 flex-1">
              <div className="skeleton h-4 w-36 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-3 w-28 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
            <div className="skeleton h-4 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-5 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-8 w-24 rounded-lg" style={{ backgroundColor: '#E5E7EB' }} />
          </div>
        ))}
      </div>

      {/* Shield section */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        <div className="px-4 py-3 border-b border-[#E5E7EB] flex flex-col gap-1">
          <div className="skeleton h-4 w-40 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          <div className="skeleton h-3 w-64 rounded" style={{ backgroundColor: '#E5E7EB' }} />
        </div>
        <div className="h-9 px-4" style={{ backgroundColor: '#F7F5F2', borderBottom: '1px solid #E5E7EB' }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 px-4 flex items-center gap-4 border-b border-[#E5E7EB] last:border-b-0">
            <div className="flex flex-col gap-1 flex-1">
              <div className="skeleton h-4 w-36 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-3 w-28 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
            <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-5 w-14 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
