export default function OverviewLoading() {
  return (
    <div className="flex flex-col">
      {/* Banner skeleton */}
      <div
        className="h-16 px-4 flex items-center justify-between"
        style={{ backgroundColor: '#FEF2F2', borderBottom: '1px solid #FECACA' }}
      >
        <div className="skeleton h-6 w-40 rounded" style={{ backgroundColor: '#FECACA' }} />
        <div className="flex gap-2">
          <div className="skeleton h-5 w-24 rounded" style={{ backgroundColor: '#FECACA' }} />
          <div className="skeleton h-5 w-24 rounded" style={{ backgroundColor: '#FECACA' }} />
        </div>
        <div className="skeleton h-5 w-32 rounded" style={{ backgroundColor: '#FECACA' }} />
      </div>

      <div className="p-6 flex flex-col gap-6">
        {/* Title skeleton */}
        <div className="skeleton h-7 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />

        {/* Metric cards skeleton */}
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg p-6 flex flex-col gap-3"
              style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
            >
              <div className="flex items-center justify-between">
                <div className="skeleton h-4 w-32 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                <div className="skeleton h-5 w-5 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              </div>
              <div className="skeleton h-8 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
              <div className="skeleton h-4 w-36 rounded" style={{ backgroundColor: '#E5E7EB' }} />
            </div>
          ))}
        </div>

        {/* War Room skeleton */}
        <div>
          <div className="skeleton h-5 w-24 rounded mb-4" style={{ backgroundColor: '#E5E7EB' }} />
          <div className="flex gap-4">
            {[0, 1, 2].map((col) => (
              <div key={col} className="flex flex-col gap-3 flex-1">
                <div className="skeleton h-4 w-24 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                {[0, 1, 2].map((row) => (
                  <div
                    key={row}
                    className="bg-white rounded-lg p-4 flex flex-col gap-2"
                    style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="skeleton h-4 w-28 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                      <div className="skeleton h-4 w-16 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="skeleton h-5 w-20 rounded" style={{ backgroundColor: '#E5E7EB' }} />
                      <div className="skeleton h-5 w-16 rounded-full" style={{ backgroundColor: '#E5E7EB' }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
