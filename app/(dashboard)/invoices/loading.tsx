export default function InvoicesLoading() {
  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-7 w-40 rounded" style={{ backgroundColor: '#E5E7EB' }} />
        <div className="skeleton h-9 w-28 rounded-lg" style={{ backgroundColor: '#E5E7EB' }} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-8 w-24 rounded-lg" style={{ backgroundColor: '#E5E7EB' }} />
        ))}
      </div>

      {/* Table */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        {/* Header */}
        <div
          className="h-9 px-4 flex items-center gap-4"
          style={{ backgroundColor: '#F7F5F2', borderBottom: '1px solid #E5E7EB' }}
        >
          {[140, 60, 80, 50, 80, 70, 70, 20].map((w, i) => (
            <div
              key={i}
              className="skeleton h-3 rounded"
              style={{ backgroundColor: '#E5E7EB', width: `${w}px` }}
            />
          ))}
        </div>

        {/* Rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-14 px-4 flex items-center gap-4 border-b border-[#E5E7EB] last:border-b-0"
          >
            <div className="flex flex-col gap-1 flex-1">
              <div className="skeleton h-4 w-36 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-3 w-28 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
            <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-5 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-5 w-14 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-5 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-6 w-6 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-4 w-48 rounded" style={{ backgroundColor: '#E5E7EB' }} />
        <div className="flex gap-2">
          <div className="skeleton h-8 w-24 rounded-lg" style={{ backgroundColor: '#E5E7EB' }} />
          <div className="skeleton h-8 w-16 rounded-lg" style={{ backgroundColor: '#E5E7EB' }} />
        </div>
      </div>
    </div>
  );
}
