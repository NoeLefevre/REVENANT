export default function PreventionLoading() {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex flex-col gap-4">
        <div className="skeleton h-7 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />

        {/* Stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg p-5 flex flex-col gap-2"
              style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
            >
              <div className="skeleton h-3 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-8 w-12 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-3 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-1 p-1 rounded-lg"
          style={{ backgroundColor: '#F7F5F2', border: '1px solid #F0EDE8' }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton h-9 rounded-md"
              style={{ backgroundColor: '#E5E7EB', flex: 1 }}
            />
          ))}
        </div>
      </div>

      {/* Table section */}
      <div className="px-6 pb-6">
        <div
          className="bg-white rounded-lg overflow-hidden"
          style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
        >
          {/* Table header */}
          <div
            className="h-9 px-4"
            style={{ backgroundColor: '#F7F5F2', borderBottom: '1px solid #E5E7EB' }}
          />

          {/* Table rows */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 px-4 flex items-center gap-4 border-b border-[#E5E7EB] last:border-b-0"
            >
              {/* Avatar + name */}
              <div className="flex items-center gap-3 flex-1">
                <div
                  className="skeleton w-8 h-8 rounded-full flex-shrink-0"
                  style={{ backgroundColor: '#E5E7EB' }}
                />
                <div className="flex flex-col gap-1">
                  <div className="skeleton h-4 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                  <div className="skeleton h-3 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                </div>
              </div>
              {/* Risk signals */}
              <div className="flex gap-1.5">
                <div className="skeleton h-5 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                <div className="skeleton h-5 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              </div>
              {/* Status */}
              <div className="skeleton h-5 w-20 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
              {/* Score */}
              <div className="skeleton h-6 w-10 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              {/* Date */}
              <div className="skeleton h-4 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
