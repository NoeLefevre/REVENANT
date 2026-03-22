export default function SequencesLoading() {
  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="skeleton h-7 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />

      {/* Tabs */}
      <div className="flex items-center border-b border-[#E5E7EB] gap-4 pb-0">
        <div className="skeleton h-5 w-16 rounded mb-2" style={{ backgroundColor: '#E5E7EB' }} />
        <div className="skeleton h-5 w-16 rounded mb-2" style={{ backgroundColor: '#E5E7EB' }} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg p-5 flex flex-col gap-2"
            style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
          >
            <div className="skeleton h-3 w-28 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-8 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        <div
          className="h-9 px-4 flex items-center gap-4"
          style={{ backgroundColor: '#F7F5F2', borderBottom: '1px solid #E5E7EB' }}
        >
          {[140, 80, 50, 70, 70, 70, 20].map((w, i) => (
            <div
              key={i}
              className="skeleton h-3 rounded"
              style={{ backgroundColor: '#E5E7EB', width: `${w}px` }}
            />
          ))}
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-14 px-4 flex items-center gap-4 border-b border-[#E5E7EB] last:border-b-0"
          >
            <div className="flex flex-col gap-1 flex-1">
              <div className="skeleton h-4 w-36 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-3 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
            <div className="skeleton h-5 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-12 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-4 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-5 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            <div className="skeleton h-6 w-6 rounded" style={{ backgroundColor: '#E5E7EB' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
